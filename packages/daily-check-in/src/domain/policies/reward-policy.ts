import { DailyCheckInError } from "../error.js";

/** DailyCheckIn owns the reward policy. */
export const DAILY_CHECK_IN_POLICY = {
  version: "wheel-v1",
  totalWeight: 100,
  prizes: [
    { code: "coin-half", amount: 0.5, weight: 60 },
    { code: "coin-one", amount: 1, weight: 30 },
    { code: "coin-four", amount: 4, weight: 10 },
  ],
} as const;

export type DailyCheckInPrizeCode = (typeof DAILY_CHECK_IN_POLICY.prizes)[number]["code"];

export function selectDailyCheckInPrize(ticket: number) {
  if (!Number.isSafeInteger(ticket) || ticket < 0 || ticket >= DAILY_CHECK_IN_POLICY.totalWeight) {
    throw new DailyCheckInError(500, "簽到獎勵設定不正確。");
  }
  let cursor = ticket;
  for (const prize of DAILY_CHECK_IN_POLICY.prizes) {
    if (cursor < prize.weight) return prize;
    cursor -= prize.weight;
  }
  throw new DailyCheckInError(500, "簽到獎勵設定不正確。");
}
