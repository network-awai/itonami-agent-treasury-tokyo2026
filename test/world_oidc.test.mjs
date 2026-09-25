import assert from "node:assert/strict";
import test from "node:test";
import { beginWorldApproval, completeWorldApproval } from "../workers/grok-bots/world_oidc.js";

const actionHash = "0x" + "a".repeat(64);
const clientId = "world-test-client";
const clientSecret = "server-only-test-secret";
const redirectUri = "https://bots.itonami.cloud/v1/bot-economy/world/callback";
const now = 1_800_000_000_000;

function b64url(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signedIdToken(nonce, signingKey, overrides = {}) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-key" }));
  const body = b64url(JSON.stringify({
    iss: "https://sandbox.auth.world.org", sub: "pairwise-subject", aud: clientId,
    nonce, iat: now / 1000, exp: now / 1000 + 120, auth_time: now / 1000,
    ...overrides,
  }));
  const data = header + "." + body;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5",
    signingKey, new TextEncoder().encode(data));
  return data + "." + b64url(new Uint8Array(signature));
}

test("fresh OIDC login validates signed token before approving one action", async () => {
  const challenge = await beginWorldApproval({ clientId, redirectUri, actionHash, now });
  const url = new URL(challenge.authorization_url);
  assert.equal(url.origin, "https://sandbox.auth.world.org");
  assert.equal(url.searchParams.get("prompt"), "login");
  assert.equal(url.searchParams.get("max_age"), "0");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), challenge.transaction.state);
  assert.equal(url.searchParams.has("client_secret"), false);
  const keys = await crypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256",
  }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  jwk.kid = "test-key";
  jwk.alg = "RS256";
  jwk.use = "sig";
  const token = await signedIdToken(challenge.transaction.nonce, keys.privateKey);
  const fetchFn = async (target, init) => {
    if (target.endsWith("/api/v1/token")) {
      assert.equal(init.body.get("client_secret"), clientSecret);
      assert.equal(init.body.get("code_verifier"), challenge.transaction.verifier);
      return Response.json({ id_token: token });
    }
    assert.equal(target, "https://sandbox.auth.world.org/.well-known/jwks.json");
    return Response.json({ keys: [jwk] });
  };
  const approved = await completeWorldApproval({
    transaction: challenge.transaction, state: challenge.transaction.state,
    code: "one-time-code", clientId, clientSecret, redirectUri, now, fetchFn,
  });
  assert.equal(approved.status, "verified");
  assert.equal(approved.action_hash, actionHash);
  assert.equal(approved.identity.subject, "pairwise-subject");

  const denied = await completeWorldApproval({
    transaction: challenge.transaction, state: challenge.transaction.state,
    code: "one-time-code", clientId, clientSecret, redirectUri, now,
    fetchFn: async (target, init) => target.endsWith("/api/v1/token")
      ? Response.json({ id_token: await signedIdToken("wrong-nonce", keys.privateKey) })
      : Response.json({ keys: [jwk] }),
  });
  assert.equal(denied.status, "denied");
});

test("cancelled, mismatched and expired authorization cannot approve", async () => {
  const challenge = await beginWorldApproval({ clientId, redirectUri, actionHash, now });
  const noFetch = async () => { throw Error("must not contact IdP"); };
  const inputs = [
    { state: challenge.transaction.state, error: "access_denied", code: null, now },
    { state: "other-state", code: "code", now },
    { state: challenge.transaction.state, code: "code", now: now + 121_000 },
  ];
  for (const input of inputs) {
    const result = await completeWorldApproval({
      transaction: challenge.transaction, clientId, clientSecret, redirectUri,
      fetchFn: noFetch, ...input,
    });
    assert.equal(result.status, "denied");
  }
});
