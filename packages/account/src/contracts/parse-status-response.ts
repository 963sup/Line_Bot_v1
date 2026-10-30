import { isRecord, stringValue } from "@line_bot_v1/platform/validation";
import type { UserProfileStatusChangeResult } from "./dto/user-profile-status.js";
import type { UserProfileStatus } from "./repositories/user-profile-status.js";

function nullableText(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("狀態回應格式不正確。");
  return value;
}

function number(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error("狀態回應格式不正確。");
  }
  return value;
}

export function readStatus(value: unknown): UserProfileStatus {
  if (!isRecord(value) || typeof value.limitedAvailability !== "boolean") {
    throw new Error("狀態回應格式不正確。");
  }
  return {
    userId: stringValue(value.userId),
    message: nullableText(value.message),
    emoji: nullableText(value.emoji),
    limitedAvailability: value.limitedAvailability,
    expiresAt: value.expiresAt === null ? null : number(value.expiresAt),
    version: number(value.version),
    createdAt: number(value.createdAt),
    updatedAt: number(value.updatedAt),
  };
}

export function readChangedStatus(value: unknown): UserProfileStatusChangeResult {
  if (!isRecord(value) || typeof value.requestId !== "string") {
    throw new Error("狀態更新回應格式不正確。");
  }
  return { ...readStatus(value), requestId: value.requestId };
}
