import type { UserManagementPersistence } from "../../contracts/output/user-management-transactions.js";
import type { UserStatusReceipt } from "../../contracts/user-management.js";
import {
  assertUserManagementTarget,
  decideUserStatusChange,
  requireUserManagementPermissions,
  UserError,
} from "../../domain/user.js";
import type { UserStatusCommand } from "../commands/user-status.js";

export function changeUserStatus(
  store: UserManagementPersistence,
  actor: string,
  input: UserStatusCommand,
  now: number,
) {
  const command = { ...input };
  return store.transact(
    actor,
    command.target,
    {
      requestId: command.requestId,
      payload: JSON.stringify(command),
      action: command.action,
      reason: command.reason,
    },
    async (transaction) => {
      requireUserManagementPermissions(await transaction.permissions(), true);
      assertUserManagementTarget(actor, command.target);
      const previous = await transaction.replay();
      if (previous) {
        if (!previous.matches) throw new UserError(409, "操作編號已用於不同內容。");
        return previous.result;
      }
      const target = await transaction.target();
      if (!target) throw new UserError(404, "使用者不存在。");
      const next = decideUserStatusChange(
        { action: command.action, expectedVersion: command.expectedVersion },
        target,
      );
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
    },
  );
}
