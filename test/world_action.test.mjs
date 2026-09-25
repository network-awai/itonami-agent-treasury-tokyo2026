import assert from "node:assert/strict";
import test from "node:test";
import { paymentActionHash } from "../workers/grok-bots/world_action.js";

const input = { position_id: "position:1", service: "murakumo", method: "POST",
  endpoint: "https://x402.nexus/gateway/murakumo/x402/v1/chat/completions",
  body: { query: "hello" } };
const quote = { endpoint: input.endpoint, amount_micros: 10_000,
  challenge: { accepts: [{ payTo: "0x1111111111111111111111111111111111111111",
    asset: "USDC", maxAmountRequired: "10000" }] } };

test("World approval hash binds payment recipient, amount and request", async () => {
  const original = await paymentActionHash(input, quote, "unused");
  assert.match(original, /^0x[0-9a-f]{64}$/);
  assert.equal(await paymentActionHash(input, quote, "unused"), original);
  const changes = [
    [input, { ...quote, amount_micros: 10_001 }],
    [input, { ...quote, challenge: { accepts: [{ ...quote.challenge.accepts[0],
      payTo: "0x2222222222222222222222222222222222222222" }] } }],
    [{ ...input, body: { query: "different" } }, quote],
    [{ ...input, endpoint: "https://x402.nexus/other" }, quote],
  ];
  for (const [changedInput, changedQuote] of changes) {
    assert.notEqual(await paymentActionHash(changedInput, changedQuote, "unused"), original);
  }
});
