// Read-only treasury top-up quote. This never signs or submits a swap.
// Base addresses are from the official Uniswap v3 Base deployments.
import { decodeFunctionResult, encodeFunctionData, getAddress, isAddress, parseAbi } from "viem";

const QUOTER = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";
const WETH = "0x4200000000000000000000000000000000000006";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
const AMOUNT_IN = 5_000_000_000_000_000n; // 0.005 WETH; fixed public demo amount.
const QUOTER_ABI = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);
const TOKEN_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
]);
const ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[] results)",
]);

export async function quoteTreasuryTopup(fetchFn = fetch, rpcUrl = "https://base-rpc.publicnode.com") {
  const data = encodeFunctionData({ abi: QUOTER_ABI, functionName: "quoteExactInputSingle",
    args: [{ tokenIn: WETH, tokenOut: USDC, amountIn: AMOUNT_IN, fee: 500,
      sqrtPriceLimitX96: 0n }] });
  let response;
  try {
    response = await fetchFn(rpcUrl, { method: "POST", redirect: "manual",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call",
        params: [{ to: QUOTER, data }, "latest"] }),
      signal: AbortSignal.timeout(6000) });
  } catch (_) {
    return { status: "held", reason: "base-rpc-unavailable", payment_submitted: false };
  }
  if (!response.ok) {
    return { status: "held", reason: "base-rpc-error", payment_submitted: false };
  }
  let result;
  try { result = await response.json(); } catch (_) {
    return { status: "held", reason: "invalid-rpc-response", payment_submitted: false };
  }
  if (result?.error || !/^0x[0-9a-f]+$/i.test(String(result?.result ?? ""))) {
    return { status: "held", reason: "invalid-rpc-response", payment_submitted: false };
  }
  let amountOut;
  let gasEstimate;
  try {
    [amountOut, , , gasEstimate] = decodeFunctionResult({ abi: QUOTER_ABI,
      functionName: "quoteExactInputSingle", data: result.result });
  } catch (_) {
    return { status: "held", reason: "invalid-quote", payment_submitted: false };
  }
  if (amountOut <= 0n) {
    return { status: "held", reason: "empty-quote", payment_submitted: false };
  }
  return { object: "itonami.uniswap-treasury-quote", status: "quote-only",
    network: "base", chain_id: 8453, protocol: "uniswap-v3", fee: 500,
    quoter: QUOTER, token_in: WETH, token_out: USDC,
    amount_in_wei: AMOUNT_IN.toString(), amount_out_micros: amountOut.toString(),
    min_amount_out_micros: (amountOut * 9950n / 10000n).toString(),
    slippage_bps: 50, gas_estimate: gasEstimate.toString(),
    quoted_at: new Date().toISOString(), payment_submitted: false };
}

async function readTokenUint(functionName, args, fetchFn, rpcUrl) {
  const data = encodeFunctionData({ abi: TOKEN_ABI, functionName, args });
  const response = await fetchFn(rpcUrl, { method: "POST", redirect: "manual",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call",
      params: [{ to: WETH, data }, "latest"] }),
    signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error("base-rpc-error");
  const result = await response.json();
  if (result?.error || !/^0x[0-9a-f]+$/i.test(String(result?.result ?? ""))) {
    throw new Error("invalid-rpc-response");
  }
  return decodeFunctionResult({ abi: TOKEN_ABI, functionName, data: result.result });
}

// Unsigned transaction plan. The caller must bind recipient to its linked
// wallet before calling; this module never approves, signs, or broadcasts.
export async function planTreasuryTopup(recipient, fetchFn = fetch,
  rpcUrl = "https://base-rpc.publicnode.com", now = Date.now()) {
  if (!isAddress(recipient)) {
    return { status: "held", reason: "invalid-recipient", payment_submitted: false };
  }
  const wallet = getAddress(recipient);
  const quote = await quoteTreasuryTopup(fetchFn, rpcUrl);
  if (quote.status !== "quote-only") return quote;
  let balance;
  let allowance;
  try {
    [balance, allowance] = await Promise.all([
      readTokenUint("balanceOf", [wallet], fetchFn, rpcUrl),
      readTokenUint("allowance", [wallet, ROUTER], fetchFn, rpcUrl),
    ]);
  } catch (_) {
    return { status: "held", reason: "wallet-state-unavailable", payment_submitted: false };
  }
  if (balance < AMOUNT_IN) {
    return { status: "held", reason: "insufficient-weth", network: "base",
      wallet, balance_wei: balance.toString(), required_wei: AMOUNT_IN.toString(),
      payment_submitted: false };
  }
  const deadline = Math.floor(now / 1000) + 120;
  const swapData = encodeFunctionData({ abi: ROUTER_ABI, functionName: "exactInputSingle",
    args: [{ tokenIn: WETH, tokenOut: USDC, fee: 500, recipient: wallet,
      amountIn: AMOUNT_IN, amountOutMinimum: BigInt(quote.min_amount_out_micros),
      sqrtPriceLimitX96: 0n }] });
  const calldata = encodeFunctionData({ abi: ROUTER_ABI, functionName: "multicall",
    args: [BigInt(deadline), [swapData]] });
  return { object: "itonami.uniswap-treasury-plan", status: "unsigned-plan",
    network: "base", chain_id: 8453, wallet,
    router: ROUTER, quoted_at: quote.quoted_at, deadline_unix: deadline,
    amount_in_wei: AMOUNT_IN.toString(),
    amount_out_micros: quote.amount_out_micros,
    min_amount_out_micros: quote.min_amount_out_micros,
    approval_required: allowance < AMOUNT_IN,
    approval_transaction: allowance < AMOUNT_IN ? {
      to: WETH, value: "0", data: encodeFunctionData({ abi: TOKEN_ABI,
        functionName: "approve", args: [ROUTER, AMOUNT_IN] }) } : null,
    swap_transaction: { to: ROUTER, value: "0", data: calldata },
    payment_submitted: false, swap_submitted: false };
}
