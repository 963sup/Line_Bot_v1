import type { UserProfileStatusFields } from "../../domain/user-profile-status.js";
import type { UserProfileStatus } from "../repositories/user-profile-status.js";

export type UserProfileStatusChange = Readonly<
  UserProfileStatusFields & {
    requestId: string;
    expectedVersion: number;
  }
>;

export type UserProfileStatusChangeResult = Readonly<
  UserProfileStatus & {
    requestId: string;
  }
>;
