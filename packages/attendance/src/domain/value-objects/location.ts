import { AttendanceError } from "../error.js";

export type Location = { latitude: number; longitude: number; accuracy: number };
export type AttendanceSite = { latitude: number; longitude: number; radius: number };

function isObjectValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseLocation(value: unknown): Location {
  if (!isObjectValue(value)) {
    throw new AttendanceError(400, "請提供本次定位。");
  }
  const { latitude, longitude, accuracy } = value;
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    typeof accuracy !== "number" ||
    !Number.isFinite(accuracy) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    accuracy < 0
  )
    throw new AttendanceError(400, "定位資料不正確，請重新定位。");
  return { latitude, longitude, accuracy };
}
