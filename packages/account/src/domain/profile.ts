import { UserError } from "./user.js";

export const USER_PROFILE_VISIBILITIES = ["private", "organization", "public"] as const;
export type UserProfileVisibility = (typeof USER_PROFILE_VISIBILITIES)[number];
type ProfileFields = Readonly<{
  displayName: string | null;
  bio: string | null;
  visibility: UserProfileVisibility;
}>;

function nullableText(value: unknown, maxLength: number, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new UserError(400, `${label}格式不正確。`);
  const text = value.trim();
  if (!text) return null;
  if (text.length > maxLength) throw new UserError(400, `${label}過長。`);
  return text;
}

function isVisibility(value: unknown): value is UserProfileVisibility {
  return USER_PROFILE_VISIBILITIES.some((candidate) => candidate === value);
}

export function userProfileFields(input: Record<string, unknown>): ProfileFields {
  const displayName = nullableText(input.displayName, 120, "顯示名稱");
  const bio = nullableText(input.bio, 2000, "自我介紹");
  if (!isVisibility(input.visibility)) throw new UserError(400, "個人資料可見範圍不正確。");
  return { displayName, bio, visibility: input.visibility };
}

export function canReadPublicUserProfile(visibility: UserProfileVisibility) {
  return visibility === "public";
}

export function requireProfileWriter(status: string | null) {
  if (status !== "active") throw new UserError(403, "目前會員資格無法更新個人資料。");
}

export function decideProfileSave(
  current: (ProfileFields & { version: number }) | null,
  next: ProfileFields,
  expectedVersion: number,
): "create" | "retry" | "update" {
  if (!current) {
    if (expectedVersion !== 0) throw new UserError(409, "個人資料已更新，請重新載入。");
    return "create";
  }
  if (
    current.version === expectedVersion + 1 &&
    current.displayName === next.displayName &&
    current.bio === next.bio &&
    current.visibility === next.visibility
  )
    return "retry";
  if (current.version !== expectedVersion) throw new UserError(409, "個人資料已更新，請重新載入。");
  return "update";
}
