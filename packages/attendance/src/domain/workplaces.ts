import type { AttendanceSite } from "./attendance.js";
import { AttendanceError } from "./error.js";

export type Workplace = AttendanceSite & {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  version: number;
};

export type WorkplaceCommand = {
  action: "save";
  requestId: string;
  id: string;
  expectedVersion: number;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  radius: number;
  enabled: boolean;
};

export function parseWorkplaceCommand(raw: unknown): WorkplaceCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AttendanceError(400, "地點資料不正確。");
  }
  const command = raw as WorkplaceCommand;
  const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  if (
    command.action !== "save" ||
    !uuid.test(command.requestId) ||
    !uuid.test(command.id) ||
    !Number.isSafeInteger(command.expectedVersion) ||
    command.expectedVersion < 0 ||
    Object.keys(command).some(
      (key) =>
        ![
          "action",
          "requestId",
          "id",
          "expectedVersion",
          "name",
          "description",
          "latitude",
          "longitude",
          "radius",
          "enabled",
        ].includes(key),
    ) ||
    typeof command.name !== "string" ||
    !command.name.trim() ||
    command.name.length > 100 ||
    typeof command.description !== "string" ||
    command.description.length > 500 ||
    ![command.latitude, command.longitude, command.radius].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    ) ||
    Math.abs(command.latitude) > 90 ||
    Math.abs(command.longitude) > 180 ||
    command.radius <= 0 ||
    command.radius > 10000 ||
    typeof command.enabled !== "boolean"
  ) {
    throw new AttendanceError(
      400,
      "請提供有效 Repository、版本、名稱、座標與 1 至 10000 公尺半徑。",
    );
  }
  return command;
}
