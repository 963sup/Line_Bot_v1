import { PermissionError, parsePermissionCommand } from "../domain/permission.js";
import type { PermissionStore } from "./permissions/ports.js";
export function createPermissions(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): PermissionStore;
  now(): number;
}) {
  return {
    async read(subject: string, target = "") {
      if (target.length > 128) throw new PermissionError(400, "會員編號不正確。");
      const member = await deps.activeUser(subject);
      return deps.store().read(member.id, target);
    },
    async change(subject: string, raw: unknown) {
      const c = parsePermissionCommand(raw);
      const member = await deps.activeUser(subject);
      return deps.store().change(member.id, c, deps.now());
    },
  };
}
