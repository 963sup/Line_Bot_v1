import type { UserProfileStatusFields } from "../../domain/user-profile-status.js";

export type UserProfileStatus = Readonly<
  UserProfileStatusFields & {
    userId: string;
    version: number;
    createdAt: number;
    updatedAt: number;
  }
>;

export interface UserProfileStatusStore {
  read(userId: string): Promise<UserProfileStatus | null>;
  readPublic(userId: string, now: number): Promise<UserProfileStatus | null>;
}
