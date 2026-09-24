import assert from "node:assert/strict";
import test from "node:test";
import { DAILY_CHECK_IN_COIN_REWARD, DailyCheckInError, dailyCheckInDay } from "../src/domain.js";

test("DailyCheckIn retains the existing reward and exact Taipei day boundary", () => {
  assert.equal(DAILY_CHECK_IN_COIN_REWARD, 1);
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
