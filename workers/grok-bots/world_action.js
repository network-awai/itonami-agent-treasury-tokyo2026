// Bind a human approval to one exact x402 payment proposal. Recompute after
// fetching the challenge again; a changed payee, amount, endpoint, or body
// requires a new approval.
export async function paymentActionHash(input, quote, defaultPositionId) {
  const requirement = quote.challenge?.accepts?.[0];
  const action = JSON.stringify({
    position_id: input.position_id || defaultPositionId,
    service: input.service, method: String(input.method || "POST").toUpperCase(),
    requested_endpoint: input.endpoint, endpoint: quote.endpoint, body: input.body ?? {},
    requirement, amount_micros: quote.amount_micros,
  });
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(action)));
  return `0x${Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("")}`;
}
