import type { PermissionChangeRequest, PermissionReceipt, PermissionView } from "../permissions.js";

/** Published typed permission capability; subject verification belongs to its caller. */
export interface PermissionStore {
  read(actor: string, target: string): Promise<PermissionView>;
  change(actor: string, command: PermissionChangeRequest, now: number): Promise<PermissionReceipt>;
}
