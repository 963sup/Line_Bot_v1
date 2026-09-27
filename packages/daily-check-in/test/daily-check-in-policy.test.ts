import assert from "node:assert/strict";
import test from "node:test";
import {
  DAILY_CHECK_IN_POLICY,
  DailyCheckInError,
  dailyCheckInDay,
  parseDailyCheckInDay,
  selectDailyCheckInPrize,
} from "../src/domain.js";

test("DailyCheckIn publishes the wheel policy and exact Taipei day boundary", () => {
  assert.deepEqual(DAILY_CHECK_IN_POLICY, {
    version: "wheel-v1",
    totalWeight: 100,
    prizes: [
      { code: "coin-half", amount: 0.5, weight: 60 },
      { code: "coin-one", amount: 1, weight: 30 },
      { code: "coin-four", amount: 4, weight: 10 },
    ],
  });
  assert.equal(dailyCheckInDay(Date.UTC(2026, 8, 13, 15, 59, 59, 999)), "2026-09-13");
  assert.equal(dailyCheckInDay(Date.UTC(2026, 8, 13, 16)), "2026-09-14");
  assert.equal(dailyCheckInDay(Date.UTC(2024, 1, 28, 16)), "2024-02-29");
  assert.equal(dailyCheckInDay(0), "1970-01-01");
});

test("DailyCheckIn rejects invalid times without depending on account lifecycle errors", () => {
  for (const now of [NaN, Infinity, -Infinity, -1, 1.5, 8_640_000_000_000_001]) {
    assert.throws(
      () => dailyCheckInDay(now),
      (error: unknown) => error instanceof DailyCheckInError && error.status === 400,
    );
  }
  assert.doesNotThrow(() => dailyCheckInDay(8_640_000_000_000_000));
});

test("DailyCheckIn selects wheel prizes by integer weight boundaries", () => {
  assert.equal(selectDailyCheckInPrize(0).code, "coin-half");
  assert.equal(selectDailyCheckInPrize(59).code, "coin-half");
  assert.equal(selectDailyCheckInPrize(60).code, "coin-one");
  assert.equal(selectDailyCheckInPrize(89).code, "coin-one");
  assert.equal(selectDailyCheckInPrize(90).code, "coin-four");
  assert.equal(selectDailyCheckInPrize(99).code, "coin-four");
  assert.throws(() => selectDailyCheckInPrize(100), DailyCheckInError);
});

test("DailyCheckIn validates client day preconditions as real calendar days", () => {
  assert.equal(parseDailyCheckInDay("2026-09-24"), "2026-09-24");
  for (const value of [null, undefined, "", "2026-9-24", "2026-02-30", "not-a-day"]) {
    assert.throws(() => parseDailyCheckInDay(value), DailyCheckInError);
  }
});
