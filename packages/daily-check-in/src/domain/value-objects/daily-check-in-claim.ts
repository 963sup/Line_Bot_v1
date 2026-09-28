import type { DAILY_CHECK_IN_POLICY, DailyCheckInPrizeCode } from "../policies/reward-policy.js";

export type DailyCheckInClaim = Readonly<{
  day: string;
  prizeCode: DailyCheckInPrizeCode;
  reward: number;
  policyVersion: typeof DAILY_CHECK_IN_POLICY.version;
  decidedAt: number;
}>;
