import { UserError } from "./user.js";

export type UserProfileStatusFields = Readonly<{
  message: string | null;
  emoji: string | null;
  limitedAvailability: boolean;
  expiresAt: number | null;
}>;

function nullableText(value: unknown, maxLength: number, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new UserError(400, `${label}格式不正確。`);
  const text = value.trim();
  if (!text) return null;
  if (text.length > maxLength) throw new UserError(400, `${label}過長。`);
  return text;
}

export function userProfileStatusFields(input: Record<string, unknown>): UserProfileStatusFields {
  if (typeof input.limitedAvailability !== "boolean") {
    throw new UserError(400, "忙碌狀態格式不正確。");
  }
  if (
    input.expiresAt !== null &&
    (!Number.isSafeInteger(input.expiresAt) ||
      Number(input.expiresAt) <= 0 ||
      Number(input.expiresAt) > 8_640_000_000_000_000)
  ) {
    throw new UserError(400, "狀態到期時間格式不正確。");
  }
  return {
    message: nullableText(input.message, 80, "狀態訊息"),
    emoji: nullableText(input.emoji, 64, "狀態表情"),
    limitedAvailability: input.limitedAvailability,
    expiresAt: input.expiresAt === null ? null : Number(input.expiresAt),
  };
}

export function requireUserProfileStatusWriter(active: boolean) {
  if (!active) throw new UserError(403, "目前會員資格無法更新狀態。");
}

function requireExpectedUserProfileStatusVersion(
  currentVersion: number | null,
  expectedVersion: number,
) {
  if ((currentVersion ?? 0) !== expectedVersion) {
    throw new UserError(409, "狀態已更新，請重新載入。");
  }
}

export function nextUserProfileStatusVersion(
  currentVersion: number | null,
  expectedVersion: number,
) {
  requireExpectedUserProfileStatusVersion(currentVersion, expectedVersion);
  return expectedVersion + 1;
}

export function isVisibleUserProfileStatus(status: UserProfileStatusFields, now: number) {
  return (
    (status.message !== null || status.emoji !== null || status.limitedAvailability) &&
    (status.expiresAt === null || status.expiresAt > now)
  );
}
