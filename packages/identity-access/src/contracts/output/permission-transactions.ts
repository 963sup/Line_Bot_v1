import type { PermissionCommand } from "../../domain/permission.js";
import type { PermissionReceipt, PermissionView } from "../permissions.js";

export interface PermissionChangeTransaction {
  readonly canManage: boolean;
  readonly target: { active: boolean } | null;
  replay(): Promise<{ matches: boolean; result: PermissionReceipt } | null>;
  version(): Promise<number>;
  dependencies(): Promise<{ canReadUsers: boolean; hasSuspendGrant: boolean }>;
  save(currentVersion: number, now: number): Promise<PermissionReceipt>;
}

export interface PermissionPersistence {
  read(actor: string, target: string): Promise<PermissionView>;
  transact<T>(
    actor: string,
    command: PermissionCommand,
    work: (transaction: PermissionChangeTransaction) => Promise<T>,
  ): Promise<T>;
}
