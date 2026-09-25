import assert from "node:assert/strict";
import test from "node:test";
import { ENSV2_MOCK_USDC, ENSV2_REGISTRAR, preflightEnsV2Name } from "../workers/grok-bots/ensv2_preflight.js";

test("ENSv2 preflight reads official Sepolia registrar and price without writing", async () => {
  const calls = [];
  const result = await preflightEnsV2Name("itonami-agent-treasury-2026", {
    async readContract(call) {
      calls.push(call);
      assert.equal(call.address, ENSV2_REGISTRAR);
      if (call.functionName === "isAvailable") return true;
      assert.equal(call.functionName, "getRegisterPrice");
      assert.equal(call.args[2], ENSV2_MOCK_USDC);
      return [8_000_021n, 0n];
    },
  });
  assert.equal(result.status, "available");
  assert.equal(result.chain_id, 11155111);
  assert.equal(result.one_year_price.base_micros, "8000021");
  assert.equal(result.registered, false);
  assert.equal(result.transaction_submitted, false);
  assert.deepEqual(calls.map(c => c.functionName), ["isAvailable", "getRegisterPrice"]);
});

test("invalid label and RPC outage hold preflight", async () => {
  assert.equal((await preflightEnsV2Name("bad name")).reason, "invalid-agent-label");
  const held = await preflightEnsV2Name("itonami-agent-treasury-2026", {
    async readContract() { throw Error("unavailable"); },
  });
  assert.equal(held.status, "held");
  assert.equal(held.registered, false);
});
