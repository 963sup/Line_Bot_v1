/** Explicit operation parameters; stale menus cannot turn a start into an end. */
const attendanceOperations = ["clock-in", "clock-out"] as const;
export type AttendanceOperation = (typeof attendanceOperations)[number];
export function isAttendanceOperation(value: unknown): value is AttendanceOperation {
  return typeof value === "string" && attendanceOperations.some((operation) => operation === value);
}
