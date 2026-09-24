/** DailyCheckIn owns the reward policy and Taipei business-day policy. */
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

export type DailyCheckInClaim = Readonly<{
  day: string;
  prizeCode: DailyCheckInPrizeCode;
  reward: number;
  policyVersion: typeof DAILY_CHECK_IN_POLICY.version;
  decidedAt: number;
}>;

/**
 * Published origin identity for the existing Ledger V1 protocol.
 * The legacy "membership" literal is preserved for history/idempotency compatibility;
 * it does not make Membership a current Domain owner.
 */
export const DAILY_CHECK_IN_LEDGER_SOURCE = {
  context: "membership",
  type: "daily_checkin",
} as const;

const calendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export class DailyCheckInError extends Error {
  constructor(
    readonly status = 400,
    message = "會員簽到時間不正確。",
  ) {
    super(message);
    this.name = "DailyCheckInError";
  }
}

/** The caller supplies the trusted server time; provider/client time is not authority. */
export function dailyCheckInDay(now: number): string {
  if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000)
    throw new DailyCheckInError();
  const parts = calendar.formatToParts(now);
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join("-");
}

export function parseDailyCheckInDay(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DailyCheckInError();
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const verified = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  if (verified !== value) throw new DailyCheckInError();
  return value;
}

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
