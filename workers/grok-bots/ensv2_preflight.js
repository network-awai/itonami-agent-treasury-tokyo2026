// Read-only ENSv2 Sepolia registrar preflight. No name is registered here.
import { createPublicClient, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";

export const ENSV2_REGISTRAR = "0xabe76f6c8dfced81aa5a2bb8034202a7136b94ca";
export const ENSV2_MOCK_USDC = "0x16f95d91dba7da3aca778ec053df0ff6c6a8aa8e";
const YEAR = 31_536_000n;
const ABI = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label,uint64 duration,address paymentToken) view returns (uint256 base,uint256 premium)",
]);

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
