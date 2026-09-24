import type { AttendanceSite } from "./attendance.js";
import { AttendanceError } from "./error.js";

export type Workplace = AttendanceSite & {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  version: number;
};
export type WorkplaceCommand = { requestId: string; id: string; expectedVersion: number } & (
  | {
      action: "save";
      name: string;
      description: string;
      latitude: number;
      longitude: number;
      radius: number;
      enabled: boolean;
    }
  | { action: "member"; memberId: string; allowed: boolean }
);
export function parseWorkplaceCommand(raw: unknown): WorkplaceCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new AttendanceError(400, "地點資料不正確。");
  const c = raw as WorkplaceCommand;
  const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  if (
    !uuid.test(c.requestId) ||
    !uuid.test(c.id) ||
    !Number.isSafeInteger(c.expectedVersion) ||
    c.expectedVersion < 0
  )
    throw new AttendanceError(400, "請提供有效操作編號與地點版本。");
  const common = ["requestId", "id", "expectedVersion", "action"];
  const keys =
    c.action === "save"
      ? ["name", "description", "latitude", "longitude", "radius", "enabled"]
      : ["memberId", "allowed"];
  if (Object.keys(c).some((k) => ![...common, ...keys].includes(k)))
    throw new AttendanceError(400, "地點含不支援的欄位。");
  if (c.action === "save") {
    if (
      typeof c.name !== "string" ||
      !c.name.trim() ||
      c.name.length > 100 ||
      typeof c.description !== "string" ||
      c.description.length > 500 ||
      ![c.latitude, c.longitude, c.radius].every(
        (v) => typeof v === "number" && Number.isFinite(v),
      ) ||
      Math.abs(c.latitude) > 90 ||
      Math.abs(c.longitude) > 180 ||
      c.radius <= 0 ||
      c.radius > 10000 ||
      typeof c.enabled !== "boolean"
    )
      throw new AttendanceError(400, "請填寫名稱、有效經緯度與 1 至 10000 公尺內的半徑。");
  } else if (c.action === "member") {
    if (
      typeof c.memberId !== "string" ||
      !c.memberId ||
      c.memberId.length > 100 ||
      typeof c.allowed !== "boolean"
    )
      throw new AttendanceError(400, "請指定會員與允許狀態。");
  } else throw new AttendanceError(400, "不支援此地點操作。");
  return c;
}
