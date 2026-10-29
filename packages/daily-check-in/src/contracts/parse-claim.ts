import { isRecord } from "@line_bot_v1/platform/validation";
import { DAILY_CHECK_IN_POLICY } from "../domain/policies/reward-policy.js";
import type { DailyCheckInClaim } from "../domain/value-objects/daily-check-in-claim.js";

export type { DailyCheckInClaim } from "../domain/value-objects/daily-check-in-claim.js";

type DailyCheckInPrizeCode = (typeof DAILY_CHECK_IN_POLICY.prizes)[number]["code"];
export function readClaim(value: unknown): DailyCheckInClaim | null {
  if (value === null) return null;
  const isPrizeCode = (code: unknown): code is DailyCheckInPrizeCode =>
    typeof code === "string" && DAILY_CHECK_IN_POLICY.prizes.some((prize) => prize.code === code);
  if (
    !isRecord(value) ||
    typeof value.day !== "string" ||
    !isPrizeCode(value.prizeCode) ||
    typeof value.reward !== "number" ||
    value.policyVersion !== DAILY_CHECK_IN_POLICY.version ||
    typeof value.decidedAt !== "number"
  )
    throw new Error("簽到回應格式不完整。");
  return {
    day: value.day,
    prizeCode: value.prizeCode,
    reward: value.reward,
    policyVersion: value.policyVersion,
    decidedAt: value.decidedAt,
  };
}

/** Parse the DailyCheckIn projection independently of host Wallet/Account composition. */
export function readDailyCheckInView(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.day !== "string" ||
    typeof value.claimedToday !== "boolean" ||
    JSON.stringify(value.policy) !== JSON.stringify(DAILY_CHECK_IN_POLICY)
  )
    throw new Error("簽到回應格式不完整。");
  return {
    day: value.day,
    claimedToday: value.claimedToday,
    claim: readClaim(value.claim),
    policy: DAILY_CHECK_IN_POLICY,
  };
}
