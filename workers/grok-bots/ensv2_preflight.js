// Read-only ENSv2 Sepolia registrar preflight. No name is registered here.
import { createPublicClient, encodeFunctionData, getAddress, http, isAddress, parseAbi } from "viem";
import { sepolia } from "viem/chains";

export const ENSV2_REGISTRAR = "0xabe76f6c8dfced81aa5a2bb8034202a7136b94ca";
export const ENSV2_MOCK_USDC = "0x16f95d91dba7da3aca778ec053df0ff6c6a8aa8e";
const YEAR = 31_536_000n;
const ABI = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label,uint64 duration,address paymentToken) view returns (uint256 base,uint256 premium)",
  "function makeCommitment(string label,address owner,bytes32 secret,address subregistry,address resolver,uint64 duration,bytes32 referrer) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function register(string label,address owner,bytes32 secret,address subregistry,address resolver,uint64 duration,address paymentToken,bytes32 referrer) returns (uint256)",
  "function MIN_COMMITMENT_AGE() view returns (uint256)",
  "function MAX_COMMITMENT_AGE() view returns (uint256)",
]);
const TOKEN_ABI = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function mint(address to,uint256 amount)",
]);
const RESOLVER_ABI = parseAbi([
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  "function roles(uint256 resource,address account) view returns (uint256)",
]);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES = "0x" + "0".repeat(64);

// A wallet signs each transaction. The secret must be generated and retained by
// the wallet client; losing it makes the commitment unusable until it expires.
export async function planEnsV2Registration({ label, owner, secret, resolver }, client = createPublicClient({
  chain: sepolia, transport: http("https://ethereum-sepolia-rpc.publicnode.com", { timeout: 6000 }),
})) {
  if (!/^[a-z0-9](?:[a-z0-9-]{3,38}[a-z0-9])$/.test(String(label ?? ""))
      || !isAddress(owner) || !isAddress(resolver)
      || resolver.toLowerCase() === ZERO_ADDRESS
      || !/^0x[0-9a-f]{64}$/i.test(String(secret ?? ""))) {
    return { status: "held", reason: "invalid-registration-input", transaction_submitted: false };
  }
  try {
    const [available, resolverCode] = await Promise.all([
      client.readContract({ address: ENSV2_REGISTRAR, abi: ABI, functionName: "isAvailable", args: [label] }),
      client.getCode({ address: getAddress(resolver) }),
    ]);
    if (!available) return { status: "held", reason: "name-unavailable", transaction_submitted: false };
    if (!resolverCode || resolverCode === "0x") {
      return { status: "held", reason: "resolver-not-deployed", transaction_submitted: false };
    }
    let supportsResolution;
    let ownerRoles;
    try {
      [supportsResolution, ownerRoles] = await Promise.all([
        client.readContract({ address: getAddress(resolver), abi: RESOLVER_ABI,
          functionName: "supportsInterface", args: ["0x9061b923"] }),
        client.readContract({ address: getAddress(resolver), abi: RESOLVER_ABI,
          functionName: "roles", args: [0n, getAddress(owner)] }),
      ]);
    } catch (_) {
      return { status: "held", reason: "resolver-interface-unverified",
        transaction_submitted: false };
    }
    if (!supportsResolution || ownerRoles === 0n) {
      return { status: "held", reason: "resolver-not-controlled-by-owner",
        transaction_submitted: false };
    }
    const [price, minAge, maxAge, commitment] = await Promise.all([
      client.readContract({ address: ENSV2_REGISTRAR, abi: ABI, functionName: "getRegisterPrice",
        args: [label, YEAR, ENSV2_MOCK_USDC] }),
      client.readContract({ address: ENSV2_REGISTRAR, abi: ABI, functionName: "MIN_COMMITMENT_AGE" }),
      client.readContract({ address: ENSV2_REGISTRAR, abi: ABI, functionName: "MAX_COMMITMENT_AGE" }),
      client.readContract({ address: ENSV2_REGISTRAR, abi: ABI, functionName: "makeCommitment",
        args: [label, getAddress(owner), secret, ZERO_ADDRESS, getAddress(resolver), YEAR, ZERO_BYTES] }),
    ]);
    const total = price[0] + price[1];
    return { object: "itonami.ensv2-registration-plan", status: "unsigned-plan",
      chain_id: sepolia.id, name: label + ".eth", owner: getAddress(owner),
      resolver: getAddress(resolver), registrar: ENSV2_REGISTRAR,
      payment_token: ENSV2_MOCK_USDC, payment_amount_micros: total.toString(),
      commitment, min_commitment_age_seconds: Number(minAge),
      max_commitment_age_seconds: Number(maxAge),
      // Commit first; approval can be signed during the commitment wait.
      commit_transaction: { to: ENSV2_REGISTRAR, value: "0",
        data: encodeFunctionData({ abi: ABI, functionName: "commit", args: [commitment] }) },
      mint_transaction: { to: ENSV2_MOCK_USDC, value: "0",
        data: encodeFunctionData({ abi: TOKEN_ABI, functionName: "mint",
          args: [getAddress(owner), total] }) },
      approval_transaction: { to: ENSV2_MOCK_USDC, value: "0",
        data: encodeFunctionData({ abi: TOKEN_ABI, functionName: "approve",
          args: [ENSV2_REGISTRAR, total] }) },
      register_transaction: { to: ENSV2_REGISTRAR, value: "0",
        data: encodeFunctionData({ abi: ABI, functionName: "register",
          args: [label, getAddress(owner), secret, ZERO_ADDRESS, getAddress(resolver), YEAR,
            ENSV2_MOCK_USDC, ZERO_BYTES] }) },
      transaction_submitted: false, registered: false };
  } catch (_) {
    return { status: "held", reason: "ensv2-sepolia-rpc-unavailable",
      transaction_submitted: false };
  }
}

export async function preflightEnsV2Name(label, client = createPublicClient({
  chain: sepolia, transport: http("https://ethereum-sepolia-rpc.publicnode.com", { timeout: 6000 }),
})) {
  if (!/^[a-z0-9](?:[a-z0-9-]{3,38}[a-z0-9])$/.test(String(label ?? ""))) {
    return { status: "held", reason: "invalid-agent-label", registered: false };
  }
  try {
    const available = await client.readContract({
      address: ENSV2_REGISTRAR, abi: ABI, functionName: "isAvailable", args: [label],
    });
    let price = null;
    if (available) {
      const [base, premium] = await client.readContract({
        address: ENSV2_REGISTRAR, abi: ABI, functionName: "getRegisterPrice",
        args: [label, YEAR, ENSV2_MOCK_USDC],
      });
      price = { base_micros: base.toString(), premium_micros: premium.toString() };
    }
    return { object: "itonami.ensv2-name-preflight", status: available ? "available" : "unavailable",
      chain_id: sepolia.id, name: label + ".eth", registrar: ENSV2_REGISTRAR,
      payment_token: ENSV2_MOCK_USDC, one_year_price: price,
      observed_at: new Date().toISOString(), registered: false,
      identity_bound: false, transaction_submitted: false };
  } catch (_) {
    return { status: "held", reason: "ensv2-sepolia-rpc-unavailable",
      registered: false, transaction_submitted: false };
  }
}
