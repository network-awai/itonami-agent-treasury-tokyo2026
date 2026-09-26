// Read the official 1inch Aqua registry on Base. This does not ship a strategy
// or imply that the treasury has a position on Aqua.
import { createPublicClient, getAddress, http, isAddress, parseAbi } from "viem";
import { base } from "viem/chains";

export const AQUA_REGISTRY = "0x1111113ccf1426a8e30e2bff5e005d929bf6a90a";
export const AQUA_SWAPVM_ROUTER = "0x111111338c5091e8440b67b168bae16a668ac0de";
const ABI = parseAbi([
  "function rawBalances(address maker,address app,bytes32 strategyHash,address token) view returns (uint248 balance,uint8 tokensCount)",
]);

export async function inspectAquaDeployment(client = createPublicClient({
  chain: base, transport: http("https://base-rpc.publicnode.com", { timeout: 6000 }),
})) {
  try {
    const [registryCode, routerCode] = await Promise.all([
      client.getCode({ address: AQUA_REGISTRY }),
      client.getCode({ address: AQUA_SWAPVM_ROUTER }),
    ]);
    const deployed = Boolean(registryCode && registryCode !== "0x"
      && routerCode && routerCode !== "0x");
    return { object: "itonami.aqua-deployment-read", status: deployed ? "read-only" : "held",
      chain_id: base.id, registry: AQUA_REGISTRY, swapvm_router: AQUA_SWAPVM_ROUTER,
      contracts_deployed: deployed, treasury_position_verified: false,
      transfer_submitted: false, observed_at: new Date().toISOString() };
  } catch (_) {
    return { status: "held", reason: "aqua-rpc-unavailable",
      contracts_deployed: false, treasury_position_verified: false,
      transfer_submitted: false };
  }
}

export async function inspectAquaPosition({ maker, strategyHash, token,
  app = AQUA_SWAPVM_ROUTER }, client = createPublicClient({
  chain: base, transport: http("https://base-rpc.publicnode.com", { timeout: 6000 }),
})) {
  if (![maker, token, app].every(isAddress)
      || !/^0x[0-9a-f]{64}$/i.test(String(strategyHash ?? ""))) {
    return { status: "held", reason: "invalid-aqua-position-input",
      transfer_submitted: false };
  }
  try {
    const [registryCode, routerCode, raw] = await Promise.all([
      client.getCode({ address: AQUA_REGISTRY }),
      client.getCode({ address: AQUA_SWAPVM_ROUTER }),
      client.readContract({ address: AQUA_REGISTRY, abi: ABI,
        functionName: "rawBalances", args: [getAddress(maker), getAddress(app),
          strategyHash, getAddress(token)] }),
    ]);
    if (!registryCode || registryCode === "0x" || !routerCode || routerCode === "0x") {
      return { status: "held", reason: "aqua-contract-unavailable",
        transfer_submitted: false };
    }
    const [balance, tokensCount] = raw;
    const active = tokensCount > 0 && tokensCount !== 255;
    return { object: "itonami.aqua-position-read", status: "read-only",
      chain_id: base.id, registry: AQUA_REGISTRY, swapvm_router: AQUA_SWAPVM_ROUTER,
      maker: getAddress(maker), app: getAddress(app), strategy_hash: strategyHash,
      token: getAddress(token), balance: balance.toString(), tokens_count: tokensCount,
      active, observed_at: new Date().toISOString(), transfer_submitted: false };
  } catch (_) {
    return { status: "held", reason: "aqua-rpc-unavailable",
      transfer_submitted: false };
  }
}
