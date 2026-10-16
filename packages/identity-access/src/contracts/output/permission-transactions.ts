import type { Permission } from "../../domain/permission.js";
import type { PermissionReceipt, PermissionView } from "../permissions.js";

export interface PermissionChangeTransaction {
  readonly canManage: boolean;
  readonly target: { active: boolean } | null;
  replay(): Promise<{ matches: boolean; result: PermissionReceipt } | null>;
  version(): Promise<number>;
  dependencies(): Promise<{ canReadUsers: boolean; hasSuspendGrant: boolean }>;
  save(
    permission: Permission,
    enabled: boolean,
    currentVersion: number,
    now: number,
  ): Promise<PermissionReceipt>;
}

export interface PermissionPersistence {
  read(actor: string, target: string): Promise<PermissionView>;
  transact<T>(
    actor: string,
    target: string,
    evidence: { requestId: string; payload: string },
    work: (transaction: PermissionChangeTransaction) => Promise<T>,
  ): Promise<T>;
}
