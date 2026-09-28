import type { AttendanceOperation } from "../../shared/presentation/attendance-operation";
export const attendanceOperationLabels = {
  "clock-in": "上班",
  "clock-out": "下班",
} as const satisfies Record<AttendanceOperation, string>;
