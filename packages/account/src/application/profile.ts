import type {
  PublicUserProfile,
  UserProfile,
  UserProfileStore,
  UserProfileUpdate,
} from "../contracts/repositories/profile.js";
import { canReadPublicUserProfile, userProfileFields } from "../domain/profile.js";
import { UserError } from "../domain/user.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseUserProfileUpdate(input: unknown): UserProfileUpdate {
  if (!isRecord(input)) {
    throw new UserError(400, "個人資料格式不正確。");
  }
  const value = input;
  const allowed = new Set(["displayName", "bio", "visibility", "expectedVersion"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new UserError(400, "個人資料包含不支援的欄位。");
  }

  const fields = userProfileFields(value);
  if (!Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 0) {
    throw new UserError(400, "個人資料版本不正確。");
  }

  return {
    displayName: fields.displayName,
    bio: fields.bio,
    visibility: fields.visibility,
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
      return profile && canReadPublicUserProfile(profile.visibility)
        ? publicProfile(profile)
        : null;
    },
    update: async (subject: string, input: unknown) =>
      deps
        .store()
        .save((await deps.activeUser(subject)).id, parseUserProfileUpdate(input), deps.now()),
  };
}
