import type { UserManagementState, UserStatus } from "../../domain/user.js";
import type { UserStatusReceipt } from "../user-management.js";

export interface UserManagementTransaction {
  permissions(): Promise<{ canRead: boolean; canSuspend: boolean }>;
  replay(): Promise<{ matches: false } | { matches: true; result: UserStatusReceipt } | null>;
  target(): Promise<UserManagementState | null>;
  protectAdministrator(): Promise<void>;
  writeStatus(status: UserStatus): Promise<number>;
  record(
    result: UserStatusReceipt,
    previousStatus: UserStatus,
    event: "suspended" | "suspension_lifted",
  ): Promise<void>;
}

export interface UserManagementPersistence {
  transact<T>(
    actor: string,
    target: string,
    evidence: { requestId: string; payload: string; action: string; reason: string },
    work: (transaction: UserManagementTransaction) => Promise<T>,
  ): Promise<T>;
}
