import type { DailyCheckInDependencies } from "../contracts/daily-check-in.js";
import { DAILY_CHECK_IN_POLICY } from "../domain/policies/reward-policy.js";
import {
  dailyCheckInDay,
  parseDailyCheckInDay,
} from "../domain/value-objects/daily-check-in-day.js";

export function createDailyCheckIn(deps: DailyCheckInDependencies) {
  return {
    checkIn: async (subject: string, expectedDay: unknown) => {
      const account = await deps.activeUser(subject);
      const now = deps.now();
      const day = parseDailyCheckInDay(expectedDay);
      return deps.store().claim(account.id, now, day);
    },
    readClaim: async (subject: string, day: unknown) => {
      const account = await deps.activeUser(subject);
      return deps.store().read(account.id, parseDailyCheckInDay(day), "active");
    },
    currentView: async (userId: string) => {
      const day = dailyCheckInDay(deps.now());
      const claim = await deps.store().read(userId, day, "any");
      return {
        day,
        claimedToday: claim !== null,
        claim,
        policy: DAILY_CHECK_IN_POLICY,
      };
    },
  };
}

export type DailyCheckIn = ReturnType<typeof createDailyCheckIn>;
