// World ID for Agents sandbox OIDC. Caller keeps transaction private,
// consumes it atomically once, and binds action_hash to the exact proposed
// high-value action before authorizing anything.
const ISSUER = "https://sandbox.auth.world.org";
const AUTHORIZE = ISSUER + "/api/v1/authorize";
const TOKEN = ISSUER + "/api/v1/token";
const JWKS = ISSUER + "/.well-known/jwks.json";
const MAX_AGE_SECONDS = 120;

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid-token-encoding");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")), c => c.charCodeAt(0));
}

function randomToken() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function beginWorldApproval({ clientId, redirectUri, actionHash, now = Date.now() }) {
  if (!clientId || !/^https:\/\//.test(redirectUri)
      || !/^0x[0-9a-f]{64}$/i.test(actionHash)) throw new Error("invalid-world-approval-config");
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const url = new URL(AUTHORIZE);
  for (const [key, value] of Object.entries({
    response_type: "code", client_id: clientId, redirect_uri: redirectUri,
    scope: "openid", state, nonce, code_challenge: base64url(new Uint8Array(digest)),
    code_challenge_method: "S256", prompt: "login", max_age: "0",
  })) url.searchParams.set(key, value);
  return { authorization_url: url.toString(), transaction: {
    state, nonce, verifier, action_hash: actionHash, created_at: now,
    expires_at: now + MAX_AGE_SECONDS * 1000,
  } };
}

function parseJsonToken(idToken) {
  const parts = String(idToken ?? "").split(".");
  if (parts.length !== 3) throw new Error("invalid-id-token");
  const header = JSON.parse(new TextDecoder().decode(fromBase64url(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(fromBase64url(parts[1])));
  if (header.alg !== "RS256" || !header.kid || header.typ && header.typ !== "JWT") {
    throw new Error("invalid-id-token-header");
  }
  return { parts, header, claims };
}

export async function verifyWorldIdToken(idToken, {
  clientId, nonce, startedAt, now = Date.now(), fetchFn = fetch,
}) {
  const { parts, header, claims } = parseJsonToken(idToken);
  const nowSeconds = Math.floor(now / 1000);
  if (claims.iss !== ISSUER || claims.aud !== clientId || claims.nonce !== nonce
      || !claims.sub || typeof claims.sub !== "string"
      || !Number.isInteger(claims.exp) || claims.exp <= nowSeconds
      || !Number.isInteger(claims.iat) || claims.iat > nowSeconds + 5
      || !Number.isInteger(claims.auth_time)
      || claims.auth_time < Math.floor(startedAt / 1000) - 5
      || nowSeconds - claims.auth_time > MAX_AGE_SECONDS) {
    throw new Error("world-id-claims-refused");
  }
  const jwksResponse = await fetchFn(JWKS, {
    headers: { accept: "application/json" }, redirect: "manual",
    signal: AbortSignal.timeout(6000),
  });
  if (!jwksResponse.ok) throw new Error("world-jwks-unavailable");
  const jwks = await jwksResponse.json();
  const jwk = jwks.keys?.find(key => key.kid === header.kid && key.kty === "RSA"
    && (!key.use || key.use === "sig") && (!key.alg || key.alg === "RS256"));
  if (!jwk) throw new Error("world-signing-key-not-found");
  const key = await crypto.subtle.importKey("jwk", jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key,
    fromBase64url(parts[2]), signed);
  if (!valid) throw new Error("world-id-signature-refused");
  return { issuer: claims.iss, subject: claims.sub, authenticated_at: claims.auth_time };
}

export async function completeWorldApproval({
  transaction, state, code, error, clientId, clientSecret, redirectUri,
  now = Date.now(), fetchFn = fetch,
}) {
  if (!transaction?.nonce || !transaction?.verifier || !transaction?.action_hash
      || !Number.isFinite(transaction.created_at)
      || !Number.isFinite(transaction.expires_at)
      || !state || state !== transaction.state
      || now > transaction.expires_at || error || !code) {
    return { status: "denied", reason: error ? "oidc-cancelled-or-denied" : "oidc-state-or-code-refused" };
  }
  if (!clientId || !clientSecret || !/^https:\/\//.test(redirectUri)) {
    return { status: "denied", reason: "oidc-client-unconfigured" };
  }
  try {
    const response = await fetchFn(TOKEN, {
      method: "POST", redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code", code, redirect_uri: redirectUri,
        client_id: clientId, client_secret: clientSecret,
        code_verifier: transaction.verifier,
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return { status: "denied", reason: "oidc-code-exchange-refused" };
    const token = await response.json();
    const identity = await verifyWorldIdToken(token.id_token, {
      clientId, nonce: transaction.nonce, startedAt: transaction.created_at,
      now, fetchFn,
    });
    return { status: "verified", action_hash: transaction.action_hash,
      identity, verified_at: now };
  } catch (_) {
    return { status: "denied", reason: "oidc-validation-refused" };
  }
}
