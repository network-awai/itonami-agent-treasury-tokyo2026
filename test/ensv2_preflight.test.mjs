import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData, parseAbi } from "viem";
import { ENSV2_MOCK_USDC, ENSV2_REGISTRAR, planEnsV2Registration, preflightEnsV2Name } from "../workers/grok-bots/ensv2_preflight.js";

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

test("ENSv2 registration plan commits exact owner, secret and deployed resolver", async () => {
  const owner = "0x1234567890abcdef1234567890abcdef12345678";
  const resolver = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const secret = "0x" + "a".repeat(64);
  const commitment = "0x" + "b".repeat(64);
  const calls = [];
  const plan = await planEnsV2Registration({ label: "itonami-agent-treasury-2026",
    owner, resolver, secret }, {
    async getCode({ address }) { assert.equal(address.toLowerCase(), resolver); return "0x6001"; },
    async readContract(call) {
      calls.push(call);
      if (call.address.toLowerCase() === resolver) {
        if (call.functionName === "supportsInterface") return true;
        if (call.functionName === "roles") return 1n;
      }
      assert.equal(call.address, ENSV2_REGISTRAR);
      if (call.functionName === "isAvailable") return true;
      if (call.functionName === "getRegisterPrice") return [8_000_021n, 0n];
      if (call.functionName === "MIN_COMMITMENT_AGE") return 60n;
      if (call.functionName === "MAX_COMMITMENT_AGE") return 86_400n;
      if (call.functionName === "makeCommitment") {
        assert.equal(call.args[1].toLowerCase(), owner);
        assert.equal(call.args[2], secret);
        assert.equal(call.args[4].toLowerCase(), resolver);
        return commitment;
      }
    },
  });
  assert.equal(plan.status, "unsigned-plan");
  assert.equal(plan.payment_amount_micros, "8000021");
  assert.equal(plan.min_commitment_age_seconds, 60);
  assert.equal(plan.commitment, commitment);
  assert.equal(plan.transaction_submitted, false);
  const mint = decodeFunctionData({ abi: parseAbi(["function mint(address to,uint256 amount)"]),
    data: plan.mint_transaction.data });
  assert.equal(mint.args[0].toLowerCase(), owner);
  assert.equal(mint.args[1], 8_000_021n);
  const commit = decodeFunctionData({ abi: parseAbi(["function commit(bytes32 commitment)"]),
    data: plan.commit_transaction.data });
  assert.equal(commit.args[0], commitment);
  const register = decodeFunctionData({ abi: parseAbi([
    "function register(string label,address owner,bytes32 secret,address subregistry,address resolver,uint64 duration,address paymentToken,bytes32 referrer) returns (uint256)"
  ]), data: plan.register_transaction.data });
  assert.equal(register.args[1].toLowerCase(), owner);
  assert.equal(register.args[2], secret);
  assert.equal(register.args[4].toLowerCase(), resolver);
  assert.equal(register.args[6].toLowerCase(), ENSV2_MOCK_USDC);
  assert.ok(calls.some(c => c.functionName === "makeCommitment"));
});

test("ENSv2 registration refuses unresolved and unavailable names", async () => {
  const input = { label: "itonami-agent-treasury-2026",
    owner: "0x1234567890abcdef1234567890abcdef12345678",
    resolver: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    secret: "0x" + "a".repeat(64) };
  assert.equal((await planEnsV2Registration({ ...input, resolver: "0x0000000000000000000000000000000000000000" })).reason,
    "invalid-registration-input");
  assert.equal((await planEnsV2Registration(input, {
    async readContract() { return true; }, async getCode() { return "0x"; },
  })).reason, "resolver-not-deployed");
  assert.equal((await planEnsV2Registration(input, {
    async readContract() { return false; }, async getCode() { return "0x6001"; },
  })).reason, "name-unavailable");
  assert.equal((await planEnsV2Registration(input, {
    async readContract(call) {
      if (call.functionName === "isAvailable") return true;
      if (call.functionName === "supportsInterface") return false;
      return 0n;
    }, async getCode() { return "0x6001"; },
  })).reason, "resolver-not-controlled-by-owner");
});
