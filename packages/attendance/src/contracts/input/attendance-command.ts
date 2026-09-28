import { AttendanceError } from "../../domain/error.js";

const attendanceInputFields = new Set(["requestId", "expectedVersion", "location"]);

export type AttendanceInput = {
  requestId: string;
  expectedVersion: number;
  location: unknown;
};

export function parseAttendanceInput(value: Record<string, unknown>): AttendanceInput {
  if (Object.keys(value).some((key) => !attendanceInputFields.has(key)))
    throw new AttendanceError(400, "出勤 API 含不支援的欄位。");
  if (typeof value.requestId !== "string" || typeof value.expectedVersion !== "number")
    throw new AttendanceError(400, "請重新整理出勤狀態後操作。");
  return {
    requestId: value.requestId,
    expectedVersion: value.expectedVersion,
    location: value.location,
  };
}
