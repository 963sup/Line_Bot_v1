import type { AttendanceSession } from "../aggregates/attendance-session.js";
import { AttendanceError } from "../error.js";
import type { AttendanceSummary } from "../value-objects/attendance-summary.js";
import { requireAttendanceTime } from "../value-objects/attendance-time.js";
import { summarizeAttendance } from "./time-classification.js";

export type MenuState = "ready" | "working";
export type AttendanceRecordView = AttendanceSession & { summary: AttendanceSummary };
export type AttendanceView = {
  records: AttendanceRecordView[];
  active: AttendanceSession | null;
  menuState: MenuState;
  computedAt: number;
};

export function attendanceView(records: AttendanceSession[], now: number): AttendanceView {
  requireAttendanceTime(now);
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
