import { DailyCheckInError } from "../error.js";

const calendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

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
