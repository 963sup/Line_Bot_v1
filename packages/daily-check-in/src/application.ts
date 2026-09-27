import type { DailyCheckInRepository } from "./application/ports/daily-check-in-repository.js";
import { DAILY_CHECK_IN_POLICY, dailyCheckInDay, parseDailyCheckInDay } from "./domain.js";

export interface DailyCheckInDependencies {
  /** Delivery-verified subjects are resolved by the Account owner before DailyCheckIn acts. */
  activeUser(subject: string): Promise<{ id: string }>;
  repository(): DailyCheckInRepository;
  now(): number;
}

export function createDailyCheckIn(deps: DailyCheckInDependencies) {
  return {
    checkIn: async (subject: string, expectedDay: unknown) => {
      const account = await deps.activeUser(subject);
      const now = deps.now();
      const day = parseDailyCheckInDay(expectedDay);
      return deps.repository().claim(account.id, now, day);
    },
    readClaim: async (subject: string, day: unknown) => {
      const account = await deps.activeUser(subject);
      return deps.repository().read(account.id, parseDailyCheckInDay(day), "active");
    },
    currentView: async (userId: string) => {
      const day = dailyCheckInDay(deps.now());
      const claim = await deps.repository().read(userId, day, "any");
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
