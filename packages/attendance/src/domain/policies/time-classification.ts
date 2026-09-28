import {
  ATTENDANCE_RULE_VERSION,
  type AttendanceSession,
} from "../aggregates/attendance-session.js";
import { AttendanceError } from "../error.js";
import type { AttendanceDay, AttendanceSummary } from "../value-objects/attendance-summary.js";
import { requireAttendanceTime, taipeiDay } from "../value-objects/attendance-time.js";

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Partition elapsed time; this is not statutory working time or payroll. */
export function summarizeAttendance(session: AttendanceSession, now: number): AttendanceSummary {
  if (session.ruleVersion !== ATTENDANCE_RULE_VERSION)
    throw new AttendanceError(500, "出勤分類規則不可用。");
  requireAttendanceTime(session.startedAt);
  requireAttendanceTime(now);
  const end = session.endedAt ?? now;
  requireAttendanceTime(end);
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
