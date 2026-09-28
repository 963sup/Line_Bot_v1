import { AttendanceError } from "../error.js";
import { type AttendanceSite, type Location, parseLocation } from "../value-objects/location.js";

export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const radians = (n: number) => (n * Math.PI) / 180;
  const h =
    Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function attendanceDistance(location: Location, site: AttendanceSite): number {
  parseLocation(location);
  if (
    ![site.latitude, site.longitude, site.radius].every(Number.isFinite) ||
    Math.abs(site.latitude) > 90 ||
    Math.abs(site.longitude) > 180 ||
    site.radius <= 0
  )
    throw new AttendanceError(503, "打卡地點尚未設定。");
  const distance = distanceMeters(location, site);
  if (location.accuracy > site.radius)
    throw new AttendanceError(422, "定位精度不足，請移至訊號良好處再試。");
  if (distance + location.accuracy > site.radius)
    throw new AttendanceError(422, "目前位置或定位誤差超出打卡範圍，請靠近工作地點再試。");
  return distance;
}
