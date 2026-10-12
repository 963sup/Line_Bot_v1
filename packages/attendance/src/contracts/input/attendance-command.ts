import { AttendanceError } from "../../domain/error.js";
import { type Location, parseLocation } from "../../domain/value-objects/location.js";

const attendanceInputFields = new Set(["requestId", "expectedVersion", "location"]);
const requestIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export type AttendanceInput = {
  requestId: string;
  expectedVersion: number;
  location: Location;
};

function isObjectValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseAttendanceInput(raw: unknown): AttendanceInput {
  if (!isObjectValue(raw)) throw new AttendanceError(400, "出勤 API 資料格式不正確。");
  const value = raw;
  if (Object.keys(value).some((key) => !attendanceInputFields.has(key)))
    throw new AttendanceError(400, "出勤 API 含不支援的欄位。");
  if (typeof value.requestId !== "string" || !requestIdPattern.test(value.requestId))
    throw new AttendanceError(400, "出勤請求編號不正確。");
  if (
    typeof value.expectedVersion !== "number" ||
    !Number.isSafeInteger(value.expectedVersion) ||
    value.expectedVersion < 0
  )
    throw new AttendanceError(400, "請重新整理出勤狀態後操作。");
  return {
    requestId: value.requestId,
    expectedVersion: value.expectedVersion,
    location: parseLocation(value.location),
  };
}
