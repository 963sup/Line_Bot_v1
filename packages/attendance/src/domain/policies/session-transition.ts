import {
  ATTENDANCE_RULE_VERSION,
  type AttendanceSession,
} from "../aggregates/attendance-session.js";
import { AttendanceError } from "../error.js";
import type { AttendanceAction } from "../value-objects/attendance-action.js";
import { taipeiDay } from "../value-objects/attendance-time.js";
import { attendanceView } from "./attendance-view.js";

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
