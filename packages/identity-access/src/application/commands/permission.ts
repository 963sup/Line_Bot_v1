import type { PermissionChangeRequest } from "../../contracts/permissions.js";
import { type Permission, PermissionError, permissions } from "../../domain/permission.js";

export type PermissionCommand = PermissionChangeRequest;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && Object.hasOwn(permissions, value);
}

export function parsePermissionCommand(raw: unknown): PermissionCommand {
  const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  if (
    !isRecord(raw) ||
    Object.keys(raw).some(
      (k) =>
        !["requestId", "target", "permission", "enabled", "expectedVersion", "reason"].includes(k),
    ) ||
    typeof raw.requestId !== "string" ||
    !uuid.test(raw.requestId) ||
    typeof raw.target !== "string" ||
    !raw.target.trim() ||
    raw.target.length > 128 ||
    !isPermission(raw.permission) ||
    typeof raw.enabled !== "boolean" ||
    typeof raw.expectedVersion !== "number" ||
    !Number.isSafeInteger(raw.expectedVersion) ||
    raw.expectedVersion < 0 ||
    typeof raw.reason !== "string" ||
    !raw.reason.trim() ||
    raw.reason.length > 500
  )
    throw new PermissionError(400, "權限設定不正確，請核對使用者、功能、範圍與原因。");
  return {
    requestId: raw.requestId,
    target: raw.target,
    permission: raw.permission,
    enabled: raw.enabled,
    expectedVersion: raw.expectedVersion,
    reason: raw.reason.trim(),
  };
}
