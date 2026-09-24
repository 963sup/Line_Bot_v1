import type { DailyCheckInRepository } from "./application/ports/daily-check-in-repository.js";
import { DAILY_CHECK_IN_COIN_REWARD, dailyCheckInDay } from "./domain.js";

export type DailyCheckInMemberView = {
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
  /** Consumer-owned query over Ledger facts for the DailyCheckIn source/day. */
  claimedToday(userId: string, day: string): Promise<boolean>;
  now(): number;
}

export function createDailyCheckIn(deps: DailyCheckInDependencies) {
  return {
    checkIn: async (subject: string) => {
      const account = await deps.activeUser(subject);
      const now = deps.now();
      const credited = await deps.repository().claim(account.id, now);
      const coins = await coinView(account.id, now);
      return {
        member: { ...(await deps.member(account.id)), coins },
        checkIn: { credited, coins },
      };
    },
    coinView,
  };

  async function coinView(memberId: string, now: number) {
    const day = dailyCheckInDay(now);
    const [balance, claimedToday] = await Promise.all([
      deps.coinBalance(memberId),
      deps.claimedToday(memberId, day),
    ]);
    return {
      balance,
      day,
      claimedToday,
      dailyReward: DAILY_CHECK_IN_COIN_REWARD,
    };
  }
}

export type DailyCheckIn = ReturnType<typeof createDailyCheckIn>;
