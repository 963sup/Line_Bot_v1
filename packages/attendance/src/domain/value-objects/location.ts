import { AttendanceError } from "../error.js";

export type Location = { latitude: number; longitude: number; accuracy: number };
export type AttendanceSite = { latitude: number; longitude: number; radius: number };

export function parseLocation(value: unknown): Location {
  if (!value || typeof value !== "object") throw new AttendanceError(400, "請提供本次定位。");
  const { latitude, longitude, accuracy } = value as Location;
  if (
    ![latitude, longitude, accuracy].every((v) => typeof v === "number" && Number.isFinite(v)) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    accuracy < 0
  )
    throw new AttendanceError(400, "定位資料不正確，請重新定位。");
  return { latitude, longitude, accuracy };
}
