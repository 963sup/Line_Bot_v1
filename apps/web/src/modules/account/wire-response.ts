import { type AccountView, parseAccountView } from "@line_bot_v1/account/application/user";
import type { UserAchievement } from "@line_bot_v1/account/contracts/output/achievements";
import type { FollowItem } from "@line_bot_v1/account/contracts/output/follows";
import type { UserProfile } from "@line_bot_v1/account/contracts/repositories/profile";
import { isRecord } from "@line_bot_v1/platform/validation";

export type { AccountView };

export function responseError(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === "string" ? value.error : fallback;
}

export const readAccount = parseAccountView;

export function readProfile(value: unknown): UserProfile {
  if (
    !isRecord(value) ||
    typeof value.userId !== "string" ||
    (value.displayName !== null && typeof value.displayName !== "string") ||
    (value.bio !== null && typeof value.bio !== "string") ||
    (value.avatarRef !== null && typeof value.avatarRef !== "string") ||
    (value.visibility !== "private" &&
      value.visibility !== "organization" &&
      value.visibility !== "public") ||
    typeof value.version !== "number" ||
    !Number.isSafeInteger(value.version) ||
    typeof value.createdAt !== "number" ||
    !Number.isFinite(value.createdAt) ||
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt)
  ) {
    throw new Error("個人資料回應格式不正確。");
  }
  return {
    userId: value.userId,
    displayName: value.displayName,
    bio: value.bio,
    avatarRef: value.avatarRef,
    visibility: value.visibility,
    version: value.version,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function readFollow(value: unknown): FollowItem {
  if (
    !isRecord(value) ||
    typeof value.userId !== "string" ||
    typeof value.followedAt !== "number" ||
    !Number.isFinite(value.followedAt)
  ) {
    throw new Error("追蹤關係回應格式不正確。");
  }
  return { userId: value.userId, followedAt: value.followedAt };
}

export function readNetwork(value: unknown): { followers: FollowItem[]; following: FollowItem[] } {
  if (!isRecord(value) || !Array.isArray(value.followers) || !Array.isArray(value.following)) {
    throw new Error("追蹤關係回應格式不正確。");
  }
  return { followers: value.followers.map(readFollow), following: value.following.map(readFollow) };
}

export function readAchievements(value: unknown): UserAchievement[] {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new Error("成就回應格式不正確。");
  return value.items.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.name !== "string" ||
      typeof item.description !== "string" ||
      (item.iconRef !== null && typeof item.iconRef !== "string") ||
      typeof item.sourceKind !== "string" ||
      typeof item.sourceId !== "string" ||
      typeof item.awardedAt !== "number" ||
      !Number.isFinite(item.awardedAt)
    )
      throw new Error("成就回應格式不正確。");
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      iconRef: item.iconRef,
      sourceKind: item.sourceKind,
      sourceId: item.sourceId,
      awardedAt: item.awardedAt,
    };
  });
}
