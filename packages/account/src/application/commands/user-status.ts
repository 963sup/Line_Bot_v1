import type { UserStatusRequest } from "../../contracts/user-management.js";
import { UserError } from "../../domain/user.js";

export type UserStatusCommand = UserStatusRequest;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseUserStatusCommand(raw: unknown): UserStatusCommand {
  if (!isRecord(raw)) throw new UserError(400, "使用者操作格式不正確。");
  const v = raw;
  if (
    Object.keys(v).some(
      (key) => !["action", "requestId", "target", "expectedVersion", "reason"].includes(key),
    ) ||
    (v.action !== "suspend" && v.action !== "unsuspend") ||
    typeof v.requestId !== "string" ||
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v.requestId) ||
    typeof v.target !== "string" ||
    !/^[\w-]{1,128}$/.test(v.target) ||
    typeof v.expectedVersion !== "number" ||
    !Number.isSafeInteger(v.expectedVersion) ||
    v.expectedVersion < 1 ||
    typeof v.reason !== "string" ||
    !v.reason.trim() ||
    v.reason.trim().length > 500
  )
    throw new UserError(400, "請核對使用者、版本與操作原因。");
  return {
    action: v.action,
    requestId: v.requestId.toLowerCase(),
    target: v.target,
    expectedVersion: v.expectedVersion,
    reason: v.reason.trim(),
  };
}
