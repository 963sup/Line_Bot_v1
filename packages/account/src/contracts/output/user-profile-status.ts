import type { UserProfileStatusFields } from "../../domain/user-profile-status.js";
import type { UserProfileStatusChangeResult } from "../dto/user-profile-status.js";
import type { UserProfileStatus } from "../repositories/user-profile-status.js";

type UserProfileStatusReplay = Readonly<{
  matches: boolean;
  result: UserProfileStatusChangeResult;
}>;

export interface UserProfileStatusTransaction {
  active(): Promise<boolean>;
  replay(payload: string): Promise<UserProfileStatusReplay | null>;
  current(): Promise<UserProfileStatus | null>;
  save(
    fields: UserProfileStatusFields,
    expectedVersion: number,
    nextVersion: number,
    at: number,
  ): Promise<UserProfileStatus>;
  record(payload: string, result: UserProfileStatusChangeResult, at: number): Promise<void>;
}

export interface UserProfileStatusPersistence {
  transact<T>(
    userId: string,
    requestId: string,
    work: (transaction: UserProfileStatusTransaction) => Promise<T>,
  ): Promise<T>;
}
