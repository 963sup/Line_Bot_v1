import type { UserManagementPersistence } from "../../contracts/output/user-management-transactions.js";
import type { UserStatusReceipt } from "../../contracts/user-management.js";
import {
  assertUserManagementTarget,
  decideUserStatusChange,
  requireUserManagementPermissions,
  UserError,
  type UserStatusCommand,
} from "../../domain/user.js";

export function changeUserStatus(
  store: UserManagementPersistence,
  actor: string,
  command: UserStatusCommand,
  now: number,
) {
  return store.transact(actor, command, async (transaction) => {
    requireUserManagementPermissions(await transaction.permissions(), true);
    assertUserManagementTarget(actor, command.target);
    const previous = await transaction.replay();
    if (previous) {
      if (!previous.matches) throw new UserError(409, "操作編號已用於不同內容。");
      return previous.result;
    }
    const target = await transaction.target();
    if (!target) throw new UserError(404, "使用者不存在。");
    const next = decideUserStatusChange(command, target);
    if (command.action === "suspend") await transaction.protectAdministrator();
    const version = await transaction.writeStatus(next.status);
    const result: UserStatusReceipt = {
      id: command.target,
      requestId: command.requestId,
      status: next.status,
      version,
      at: now,
    };
    requireUserManagementPermissions(await transaction.permissions(), true);
    await transaction.record(result, target.status, next.event);
    return result;
  });
}
