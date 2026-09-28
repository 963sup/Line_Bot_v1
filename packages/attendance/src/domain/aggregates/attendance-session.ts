export const ATTENDANCE_RULE_VERSION = "taipei-window-v1";

export type AttendanceSession = {
  id: string;
  day: string;
  startedAt: number;
  endedAt: number | null;
  ruleVersion: typeof ATTENDANCE_RULE_VERSION;
};
