// ETHGlobal Tokyo 2026: screen the counterparty before an x402 signature exists.
// The API key is a Worker secret. An absent or malformed verdict holds payment.
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const CRITICAL = new Set(["sanction_address", "known_scammer", "blacklist", "rug_pull"]);

export async function screenX402PayTo(payTo, apiKey, fetchFn = fetch) {
  if (!ADDRESS.test(String(payTo ?? ""))) {
    return { status: "held", reason: "invalid-payee-address", provider: "Intercepta" };
  }
  if (!apiKey) {
    return { status: "held", reason: "screening-key-unavailable", provider: "Intercepta" };
  }
  let response;
  try {
    response = await fetchFn(
      `https://api.web3antivirus.io/api/public/v2/extension/account/${payTo}/quick-scan`,
      { method: "GET", headers: { "X-API-KEY": apiKey, accept: "application/json" },
        signal: AbortSignal.timeout(6000), redirect: "manual" }
    );
  } catch (_) {
    return { status: "held", reason: "screening-unavailable", provider: "Intercepta" };
  }
  if (!response.ok) {
    return { status: "held", reason: "screening-http-error", provider: "Intercepta",
      http_status: response.status };
  }
  let result;
  try { result = await response.json(); } catch (_) {
    return { status: "held", reason: "screening-invalid-response", provider: "Intercepta" };
  }
  const score = result?.toxicScore;
  const traits = result?.traits;
  if (!Number.isFinite(score) || score < 0 || score > 100 || !Array.isArray(traits)) {
    return { status: "held", reason: "screening-invalid-response", provider: "Intercepta" };
  }
  const flagged = traits.filter((trait) => Number(trait?.risk) > 0)
    .map((trait) => String(trait.name ?? "unknown").slice(0, 80));
  const critical = flagged.some((name) => CRITICAL.has(name));
  const status = critical || score >= 20 ? "blocked" : score > 0 || flagged.length ? "held" : "pass";
  return { status, reason: critical ? "critical-risk-trait" : status === "blocked"
    ? "high-toxic-score" : status === "held" ? "nonzero-risk" : "screen-clear",
    provider: "Intercepta", pay_to: payTo, toxic_score: score, traits: flagged };
}
