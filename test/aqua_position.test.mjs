import assert from "node:assert/strict";
import test from "node:test";
import { AQUA_REGISTRY, AQUA_SWAPVM_ROUTER, inspectAquaDeployment, inspectAquaPosition } from "../workers/grok-bots/aqua_position.js";

const input = {
  maker: "0x1234567890abcdef1234567890abcdef12345678",
  strategyHash: "0x" + "a".repeat(64),
  token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

test("1inch Aqua read verifies deployed contracts and exact maker position", async () => {
  const result = await inspectAquaPosition(input, {
    async getCode({ address }) {
      assert.ok([AQUA_REGISTRY, AQUA_SWAPVM_ROUTER].includes(address));
      return "0x6001";
    },
    async readContract(call) {
      assert.equal(call.address, AQUA_REGISTRY);
      assert.equal(call.functionName, "rawBalances");
      assert.equal(call.args[0].toLowerCase(), input.maker);
      assert.equal(call.args[1].toLowerCase(), AQUA_SWAPVM_ROUTER);
      assert.equal(call.args[2], input.strategyHash);
      return [100_000n, 2];
    },
  });
  assert.equal(result.status, "read-only");
  assert.equal(result.active, true);
  assert.equal(result.balance, "100000");
  assert.equal(result.transfer_submitted, false);
});

test("1inch Aqua read fails closed on bad input or absent deployment", async () => {
  assert.equal((await inspectAquaPosition({ ...input, maker: "bad" })).reason,
    "invalid-aqua-position-input");
  assert.equal((await inspectAquaPosition(input, {
    async getCode() { return "0x"; }, async readContract() { return [0n, 0]; },
  })).reason, "aqua-contract-unavailable");
});

test("1inch Aqua deployment proof does not claim a treasury strategy", async () => {
  const result = await inspectAquaDeployment({
    async getCode() { return "0x6001"; },
  });
  assert.equal(result.status, "read-only");
  assert.equal(result.contracts_deployed, true);
  assert.equal(result.treasury_position_verified, false);
  assert.equal(result.transfer_submitted, false);
});
