import type { AttendanceAction } from "./attendance.js";
import { AttendanceError } from "./error.js";

export const ATTENDANCE_RULE_VERSION = "taipei-window-v1";
export type AttendanceSession = {
  id: string;
  day: string;
  startedAt: number;
  endedAt: number | null;
  ruleVersion: typeof ATTENDANCE_RULE_VERSION;
};
export type MenuState = "ready" | "working";
type AttendanceDay = {
  day: string;
  beforeMs: number;
  scheduledMs: number;
  afterMs: number;
  elapsedMs: number;
};
export type AttendanceSummary = {
  elapsedMs: number;
  beforeMs: number;
  scheduledMs: number;
  afterMs: number;
  crossesMidnight: boolean;
  provisional: boolean;
  days: AttendanceDay[];
};
export type AttendanceRecordView = AttendanceSession & { summary: AttendanceSummary };
export type AttendanceView = {
  records: AttendanceRecordView[];
  active: AttendanceSession | null;
  menuState: MenuState;
  computedAt: number;
};

const calendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function requireTime(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000)
    throw new AttendanceError(400, "出勤時間不正確。");
}
export function taipeiDay(now: number): string {
  requireTime(now);
  const parts = calendar.formatToParts(now);
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join("-");
}
const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Partition elapsed time; this is not statutory working time or payroll. */
export function summarizeAttendance(session: AttendanceSession, now: number): AttendanceSummary {
  if (session.ruleVersion !== ATTENDANCE_RULE_VERSION)
    throw new AttendanceError(500, "出勤分類規則不可用。");
  requireTime(session.startedAt);
  requireTime(now);
  const end = session.endedAt ?? now;
  requireTime(end);
  if (end < session.startedAt) throw new AttendanceError(409, "結束時間不可早於上班時間。");
  const days: AttendanceDay[] = [];
  let cursor = session.startedAt;
  while (cursor < end) {
    const midnight = Math.floor((cursor + 8 * HOUR) / DAY) * DAY - 8 * HOUR;
    const until = Math.min(end, midnight + DAY);
    const overlap = (a: number, b: number) => Math.max(0, Math.min(until, b) - Math.max(cursor, a));
    days.push({
      day: taipeiDay(cursor),
      beforeMs: overlap(midnight, midnight + 8 * HOUR),
      scheduledMs: overlap(midnight + 8 * HOUR, midnight + 17 * HOUR),
      afterMs: overlap(midnight + 17 * HOUR, midnight + DAY),
      elapsedMs: until - cursor,
    });
    cursor = until;
  }
  return {
    elapsedMs: end - session.startedAt,
    beforeMs: days.reduce((sum, day) => sum + day.beforeMs, 0),
    scheduledMs: days.reduce((sum, day) => sum + day.scheduledMs, 0),
    afterMs: days.reduce((sum, day) => sum + day.afterMs, 0),
    crossesMidnight: taipeiDay(session.startedAt) !== taipeiDay(end),
    provisional: session.endedAt === null,
    days,
  };
}

export function attendanceView(records: AttendanceSession[], now: number): AttendanceView {
  requireTime(now);
  const ordered = [...records].sort(
    (a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id),
  );
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1]!;
    if (previous.endedAt === null || previous.endedAt > ordered[i]!.startedAt)
      throw new AttendanceError(409, "出勤紀錄不可重疊。");
  }
  const active = ordered.find((r) => r.endedAt === null) ?? null;
  return {
    records: ordered.map((r) => ({ ...r, summary: summarizeAttendance(r, now) })),
    active,
    menuState: active ? "working" : "ready",
    computedAt: now,
  };
}

export function planAttendance(
  records: AttendanceSession[],
  action: AttendanceAction,
  now: number,
) {
  const view = attendanceView(records, now);
  if (action === "clockIn") {
    if (view.active) throw new AttendanceError(409, "已經上班，請先結束目前出勤。");
    if (records.some((r) => r.endedAt !== null && r.endedAt > now))
      throw new AttendanceError(409, "新出勤不可與既有紀錄重疊。");
    return {
      start: { day: taipeiDay(now), startedAt: now, ruleVersion: ATTENDANCE_RULE_VERSION },
    } as const;
  }
  if (action !== "clockOut") throw new AttendanceError(400, "不支援的出勤操作。");
  if (!view.active) throw new AttendanceError(409, "尚未上班，沒有可結束的出勤。");
  return { end: { id: view.active.id, endedAt: now, day: view.active.day } } as const;
}
