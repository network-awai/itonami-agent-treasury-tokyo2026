import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData, encodeFunctionResult, parseAbi } from "viem";
import { planTreasuryTopup, quoteTreasuryTopup } from "../workers/grok-bots/uniswap_quote.js";

const abi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);
const tokenAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
]);
const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[] results)",
]);

test("Uniswap quote is bounded, read only, and sets a conservative output floor", async () => {
  const quote = await quoteTreasuryTopup(async (url, init) => {
    assert.equal(url, "https://base-rpc.publicnode.com");
    assert.equal(init.redirect, "manual");
    const rpc = JSON.parse(init.body);
    assert.equal(rpc.method, "eth_call");
    assert.equal(rpc.params[0].to.toLowerCase(), "0x3d4e44eb1374240ce5f1b871ab261cd16335b76a");
    return Response.json({ jsonrpc: "2.0", id: 1,
      result: encodeFunctionResult({ abi, functionName: "quoteExactInputSingle",
        result: [13_473_603n, 1n, 0, 72_012n] }) });
  });
  assert.equal(quote.status, "quote-only");
  assert.equal(quote.amount_in_wei, "5000000000000000");
  assert.equal(quote.amount_out_micros, "13473603");
  assert.equal(quote.min_amount_out_micros, "13406234");
  assert.equal(quote.payment_submitted, false);
});

test("RPC error and invalid quote hold treasury top-up", async () => {
  const down = await quoteTreasuryTopup(async () => { throw Error("down"); });
  assert.equal(down.status, "held");
  const invalid = await quoteTreasuryTopup(async () => Response.json({ result: "0xdead" }));
  assert.equal(invalid.status, "held");
  assert.equal(invalid.payment_submitted, false);
});

test("unsigned swap plan binds recipient, balance, allowance, minimum output and deadline", async () => {
  const wallet = "0x1234567890abcdef1234567890abcdef12345678";
  const fetchFn = async (_url, init) => {
    const tx = JSON.parse(init.body).params[0];
    if (tx.to.toLowerCase() === "0x3d4e44eb1374240ce5f1b871ab261cd16335b76a") {
      return Response.json({ result: encodeFunctionResult({ abi,
        functionName: "quoteExactInputSingle", result: [13_473_603n, 1n, 0, 72_012n] }) });
    }
    const call = decodeFunctionData({ abi: tokenAbi, data: tx.data });
    assert.equal(call.args[0].toLowerCase(), wallet.toLowerCase());
    return Response.json({ result: encodeFunctionResult({ abi: tokenAbi,
      functionName: call.functionName,
      result: call.functionName === "balanceOf" ? 5_000_000_000_000_000n : 0n }) });
  };
  const plan = await planTreasuryTopup(wallet, fetchFn,
    "https://base-rpc.publicnode.com", 1_800_000_000_000);
  assert.equal(plan.status, "unsigned-plan");
  assert.equal(plan.approval_required, true);
  assert.equal(plan.deadline_unix, 1_800_000_120);
  assert.equal(plan.swap_submitted, false);
  const approval = decodeFunctionData({ abi: tokenAbi, data: plan.approval_transaction.data });
  assert.equal(approval.functionName, "approve");
  assert.equal(approval.args[0].toLowerCase(), plan.router.toLowerCase());
  assert.equal(approval.args[1], 5_000_000_000_000_000n);
  const multicall = decodeFunctionData({ abi: routerAbi, data: plan.swap_transaction.data });
  assert.equal(multicall.functionName, "multicall");
  assert.equal(multicall.args[0], 1_800_000_120n);
  const swap = decodeFunctionData({ abi: routerAbi, data: multicall.args[1][0] });
  assert.equal(swap.functionName, "exactInputSingle");
  assert.equal(swap.args[0].recipient.toLowerCase(), wallet.toLowerCase());
  assert.equal(swap.args[0].amountOutMinimum, 13_406_234n);
});

test("swap plan fails closed on invalid wallet, low balance, and unavailable RPC", async () => {
  assert.equal((await planTreasuryTopup("0xnope", async () => {
    throw Error("RPC should not be reached");
  })).reason, "invalid-recipient");
  const noBalance = await planTreasuryTopup("0x1234567890abcdef1234567890abcdef12345678",
    async (_url, init) => {
      const tx = JSON.parse(init.body).params[0];
      if (tx.to.toLowerCase() === "0x3d4e44eb1374240ce5f1b871ab261cd16335b76a") {
        return Response.json({ result: encodeFunctionResult({ abi,
          functionName: "quoteExactInputSingle", result: [13_473_603n, 1n, 0, 72_012n] }) });
      }
      const call = decodeFunctionData({ abi: tokenAbi, data: tx.data });
      return Response.json({ result: encodeFunctionResult({ abi: tokenAbi,
        functionName: call.functionName, result: 0n }) });
    });
  assert.equal(noBalance.reason, "insufficient-weth");
  assert.equal(noBalance.payment_submitted, false);
});
