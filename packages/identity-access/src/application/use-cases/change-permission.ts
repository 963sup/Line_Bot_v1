import { UserError } from "@line_bot_v1/account/domain/user";
import type { PermissionPersistence } from "../../contracts/output/permission-transactions.js";
import {
  assertPermissionChangeActor,
  assertPermissionChangeState,
  assertPermissionDependencies,
  PermissionError,
} from "../../domain/permission.js";
import type { PermissionCommand } from "../commands/permission.js";

/** Current authority precedes replay; every decision and write stays in one transaction. */
export function changePermission(
  store: PermissionPersistence,
  actor: string,
  input: PermissionCommand,
  now: number,
) {
  const command = { ...input };
  return store.transact(
    actor,
    command.target,
    { requestId: command.requestId, payload: JSON.stringify(command) },
    async (transaction) => {
      assertPermissionChangeActor(actor, { target: command.target }, transaction.canManage);
      const previous = await transaction.replay();
      if (previous) {
        if (!previous.matches) throw new PermissionError(409, "操作編號已用於不同內容。");
        return previous.result;
      }
      if (!transaction.target) throw new UserError(404, "使用者不存在。");
      const version = await transaction.version();
      assertPermissionChangeState(
        { enabled: command.enabled, expectedVersion: command.expectedVersion },
        version,
        transaction.target.active,
      );
      assertPermissionDependencies(
        { permission: command.permission, enabled: command.enabled },
        await transaction.dependencies(),
      );
      return transaction.save(command.permission, command.enabled, version, now);
    },
  );
}
