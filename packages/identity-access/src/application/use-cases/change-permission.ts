import { UserError } from "@line_bot_v1/account/domain/user";
import type { PermissionPersistence } from "../../contracts/output/permission-transactions.js";
import {
  assertPermissionChangeActor,
  assertPermissionChangeState,
  assertPermissionDependencies,
  type PermissionCommand,
  PermissionError,
} from "../../domain/permission.js";

/** Current authority precedes replay; every decision and write stays in one transaction. */
export function changePermission(
  store: PermissionPersistence,
  actor: string,
  command: PermissionCommand,
  now: number,
) {
  return store.transact(actor, command, async (transaction) => {
    assertPermissionChangeActor(actor, command, transaction.canManage);
    const previous = await transaction.replay();
    if (previous) {
      if (!previous.matches) throw new PermissionError(409, "操作編號已用於不同內容。");
      return previous.result;
    }
    if (!transaction.target) throw new UserError(404, "使用者不存在。");
    const version = await transaction.version();
    assertPermissionChangeState(command, version, transaction.target.active);
    assertPermissionDependencies(command, await transaction.dependencies());
    return transaction.save(version, now);
  });
}
