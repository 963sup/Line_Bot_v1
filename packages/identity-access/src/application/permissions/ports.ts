import type { PermissionView } from "../../contracts/permissions.js";
import type { PermissionCommand } from "../../domain/permission.js";
export interface PermissionStore {
  read(actor: string, target: string): Promise<PermissionView>;
  change(
    actor: string,
    command: PermissionCommand,
    now: number,
  ): Promise<{ requestId: string; version: number }>;
}
