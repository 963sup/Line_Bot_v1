import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import type { WbsCommand } from "../../contracts/dto/content.js";
import type { WbsStore } from "../../contracts/repositories/content.js";
import { reviseWbsContent } from "../../domain/content.js";
import { WbsError } from "../../domain/document.js";
import { canEditWbs } from "../../domain/policies/access.js";
import { parseWbsCommand } from "../commands/content.js";

export function executeWbsCommand(
  store: WbsStore,
  userId: string,
  command: WbsCommand,
  now: number,
) {
  return store.transact(userId, command, async (transaction) => {
    if (!canEditWbs(transaction.scope.permissions))
      throw new WbsError(403, "需要 Repository write、maintain 或 admin 才能編輯 WBS。");
    const replay = await transaction.replay();
    if (replay) return replay;
    if (transaction.scope.archived) throw new WbsError(409, "Repository 已封存，不能修改 WBS。");
    const current = await transaction.load();
    const revision = reviseWbsContent(
      current,
      command.expectedVersion,
      command,
      userId,
      transaction.nextId(),
      now,
    );
    return transaction.save(revision);
  });
}

export function createWbs(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): WbsStore;
  now(): number;
}) {
  return {
    async read(subject: string, selector: RepositorySelector, revisionId?: string) {
      if (
        revisionId !== undefined &&
        !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(revisionId)
      )
        throw new WbsError(400, "Revision ID 不正確。");
      return deps.store().read((await deps.activeUser(subject)).id, selector, revisionId);
    },
    async history(subject: string, selector: RepositorySelector, before?: number) {
      if (
        before !== undefined &&
        (!Number.isSafeInteger(before) || before < 1 || before > 2147483647)
      )
        throw new WbsError(400, "歷史游標不正確。");
      return deps.store().history((await deps.activeUser(subject)).id, selector, before);
    },
    async execute(subject: string, input: unknown) {
      const command = parseWbsCommand(input);
      return executeWbsCommand(
        deps.store(),
        (await deps.activeUser(subject)).id,
        command,
        deps.now(),
      );
    },
  };
}
