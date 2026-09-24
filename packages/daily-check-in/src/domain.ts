/** DailyCheckIn owns the reward amount and Taipei business-day policy. */
export const DAILY_CHECK_IN_COIN_REWARD = 1;

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
  readonly status = 400;
  constructor() {
    super("會員簽到時間不正確。");
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
