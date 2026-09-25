import assert from "node:assert/strict";
import test from "node:test";
import { screenX402PayTo } from "../workers/grok-bots/intercepta_screen.js";

const payee = "0x1234567890abcdef1234567890abcdef12345678";

test("clear counterparty passes the gate", async () => {
  const result = await screenX402PayTo(payee, "test-only", async (_url, request) => {
    assert.equal(request.headers["X-API-KEY"], "test-only");
    return Response.json({ toxicScore: 0, traits: [] });
  });
  assert.equal(result.status, "pass");
  assert.equal(result.reason, "screen-clear");
});

test("critical risk blocks and unavailable screening holds", async () => {
  const blocked = await screenX402PayTo(payee, "test-only", async () =>
    Response.json({ toxicScore: 100, traits: [{ name: "known_scammer", risk: 1 }] }));
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.reason, "critical-risk-trait");
  const missingKey = await screenX402PayTo(payee, "");
  assert.equal(missingKey.status, "held");
  assert.equal(missingKey.reason, "screening-key-unavailable");
});
