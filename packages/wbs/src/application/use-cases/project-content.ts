import type { ProjectWbsCommand } from "../../contracts/dto/project-content.js";
import type { ProjectWbsStore } from "../../contracts/repositories/project-content.js";
import { reviseWbsContent } from "../../domain/content.js";
import { WbsError } from "../../domain/document.js";
import { canEditProjectWbs } from "../../domain/policies/project-access.js";
import { parseProjectWbsCommand } from "../commands/project-content.js";

export function executeProjectWbsCommand(
  store: ProjectWbsStore,
  userId: string,
  command: ProjectWbsCommand,
  now: number,
) {
  return store.transact(userId, command, async (transaction) => {
    if (!canEditProjectWbs(transaction.scope.role))
      throw new WbsError(403, "需要 Project WRITE 或 ADMIN 才能編輯 WBS。");
    const replay = await transaction.replay();
    if (replay) {
      if (command.action === "import-contract")
        await transaction.contracts.verifyLine(
          userId,
          command.source.repositoryId,
          command.source,
          { requireActive: false },
        );
      return replay;
    }
    if (transaction.scope.closed) throw new WbsError(409, "Project 已關閉，不能修改 WBS。");
    const current = await transaction.load();
    if (command.action === "import-contract") {
      if ((current?.version ?? 0) !== command.expectedVersion)
        throw new WbsError(409, "WBS 版本已更新，請重新確認 Contract 映射。");
      const line = await transaction.contracts.verifyLine(
        userId,
        command.source.repositoryId,
        command.source,
        { requireActive: true },
      );
      if (line.content.repositoryId !== command.source.repositoryId)
        throw new WbsError(409, "Contract 來源 Repository 不一致。");
      const revision = reviseWbsContent(
        current,
        command.expectedVersion,
        command,
        userId,
        transaction.nextId(),
        now,
      );
      return transaction.save(revision, {
        ...command.source,
        planRevisionId: line.content.planRevisionId,
        planNodeId: line.content.node.id,
        wbsNodeId: command.node.id,
      });
    }
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

export function createProjectWbs(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): ProjectWbsStore;
  now(): number;
}) {
  return {
    async read(subject: string, selector: { projectId: string }, revisionId?: string) {
      if (
        revisionId !== undefined &&
        !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(revisionId)
      )
        throw new WbsError(400, "Revision ID 不正確。");
      return deps.store().read((await deps.activeUser(subject)).id, selector, revisionId);
    },
    async history(subject: string, selector: { projectId: string }, before?: number) {
      if (
        before !== undefined &&
        (!Number.isSafeInteger(before) || before < 1 || before > 2147483647)
      )
        throw new WbsError(400, "歷史游標不正確。");
      return deps.store().history((await deps.activeUser(subject)).id, selector, before);
    },
    async execute(subject: string, input: unknown) {
      const command = parseProjectWbsCommand(input);
      return executeProjectWbsCommand(
        deps.store(),
        (await deps.activeUser(subject)).id,
        command,
        deps.now(),
      );
    },
  };
}
