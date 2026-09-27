export type UserProfileVisibility = "private" | "organization" | "public";

export type UserProfile = Readonly<{
  userId: string;
  displayName: string | null;
  bio: string | null;
  avatarRef: string | null;
  visibility: UserProfileVisibility;
  version: number;
  createdAt: number;
  updatedAt: number;
}>;

export type PublicUserProfile = Readonly<{
  displayName: string | null;
  bio: string | null;
  avatarRef: string | null;
}>;

export type UserProfileUpdate = Readonly<{
  displayName: string | null;
  bio: string | null;
  visibility: UserProfileVisibility;
  expectedVersion: number;
}>;

export interface UserProfileStore {
  read(userId: string): Promise<UserProfile | null>;
  save(userId: string, update: UserProfileUpdate, at: number): Promise<UserProfile>;
}
