import type { DailyCheckInRepository } from "./application/ports/daily-check-in-repository.js";
import { DAILY_CHECK_IN_POLICY, dailyCheckInDay, parseDailyCheckInDay } from "./domain.js";

type DailyCheckInMemberView = {
  id: string;
  status: "paused" | "active" | "suspended";
  createdAt: number;
  googleEmail: string | null;
};

export interface DailyCheckInDependencies {
  /** Consumer-owned capability: resolve a delivery-verified subject to an active User. */
  activeUser(subject: string): Promise<{ id: string }>;
  /** Consumer-owned projection; Account remains the authority for User fields. */
  member(userId: string): Promise<DailyCheckInMemberView>;
  repository(): DailyCheckInRepository;
  /** Consumer-owned projection over the Wallet owner. */
  coinBalance(userId: string): Promise<number>;
  now(): number;
}

export function createDailyCheckIn(deps: DailyCheckInDependencies) {
  return {
    checkIn: async (subject: string, expectedDay: unknown) => {
      const account = await deps.activeUser(subject);
      const now = deps.now();
      const day = parseDailyCheckInDay(expectedDay);
      const result = await deps.repository().claim(account.id, now, day);
      const coins = await coinView(account.id, now);
      return {
        member: { ...(await deps.member(account.id)), coins },
        checkIn: { ...result, coins },
      };
    },
    readClaim: async (subject: string, day: unknown) => {
      const account = await deps.activeUser(subject);
      return deps.repository().read(account.id, parseDailyCheckInDay(day), "active");
    },
    coinView,
  };

  async function coinView(memberId: string, now: number) {
    const day = dailyCheckInDay(now);
    const [balance, claim] = await Promise.all([
      deps.coinBalance(memberId),
      deps.repository().read(memberId, day, "any"),
    ]);
    return {
      balance,
      day,
      claimedToday: claim !== null,
      claim,
      policy: DAILY_CHECK_IN_POLICY,
    };
  }
}

export type DailyCheckIn = ReturnType<typeof createDailyCheckIn>;
