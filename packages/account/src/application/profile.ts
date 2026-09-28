import { UserError } from "../domain/user.js";
import type {
  PublicUserProfile,
  UserProfile,
  UserProfileStore,
  UserProfileUpdate,
  UserProfileVisibility,
} from "./ports/profile.js";

const visibilities = new Set<UserProfileVisibility>(["private", "organization", "public"]);

function nullableText(value: unknown, maxLength: number, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new UserError(400, `${label}格式不正確。`);
  const text = value.trim();
  if (!text) return null;
  if (text.length > maxLength) throw new UserError(400, `${label}過長。`);
  return text;
}

export function parseUserProfileUpdate(input: unknown): UserProfileUpdate {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new UserError(400, "個人資料格式不正確。");
  }
  const value = input as Record<string, unknown>;
  const allowed = new Set(["displayName", "bio", "visibility", "expectedVersion"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new UserError(400, "個人資料包含不支援的欄位。");
  }

  const displayName = nullableText(value.displayName, 120, "顯示名稱");
  const bio = nullableText(value.bio, 2000, "自我介紹");
  if (!visibilities.has(value.visibility as UserProfileVisibility)) {
    throw new UserError(400, "個人資料可見範圍不正確。");
  }
  if (!Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 0) {
    throw new UserError(400, "個人資料版本不正確。");
  }

  return {
    displayName,
    bio,
    visibility: value.visibility as UserProfileVisibility,
    expectedVersion: Number(value.expectedVersion),
  };
}

function publicProfile(profile: UserProfile): PublicUserProfile {
  return {
    displayName: profile.displayName,
    bio: profile.bio,
    avatarRef: profile.avatarRef,
  };
}

export function createUserProfiles(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): UserProfileStore;
  now(): number;
}) {
  return {
    get: async (subject: string) => deps.store().read((await deps.activeUser(subject)).id),
    publicByUserId: async (userId: string) => {
      const profile = await deps.store().read(userId);
      return profile?.visibility === "public" ? publicProfile(profile) : null;
    },
    update: async (subject: string, input: unknown) =>
      deps
        .store()
        .save((await deps.activeUser(subject)).id, parseUserProfileUpdate(input), deps.now()),
  };
}
