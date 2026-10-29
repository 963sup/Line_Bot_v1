import assert from "node:assert/strict";
import { test } from "node:test";
import { readClaim, readDailyCheckInView } from "../src/contracts/parse-claim.js";
import { DAILY_CHECK_IN_POLICY } from "../src/domain/policies/reward-policy.js";

test("claim projection rejects foreign policy or prize while preserving a missing claim", () => {
  assert.equal(readClaim(null), null);
  const claim = {
    day: "2026-10-29",
    prizeCode: DAILY_CHECK_IN_POLICY.prizes[0]?.code,
    reward: 1,
    policyVersion: DAILY_CHECK_IN_POLICY.version,
    decidedAt: 10,
  };
  assert.deepEqual(readClaim(claim), claim);
  assert.throws(() => readClaim({ ...claim, policyVersion: "foreign" }));
  assert.throws(() => readClaim({ ...claim, prizeCode: "foreign" }));
});

test("DailyCheckIn view requires the owner policy while preserving unclaimed state", () => {
  const view = {
    day: "2026-10-29",
    claimedToday: false,
    claim: null,
    policy: DAILY_CHECK_IN_POLICY,
  };
  assert.deepEqual(readDailyCheckInView(view), view);
  assert.throws(() => readDailyCheckInView({ ...view, policy: {} }));
});
