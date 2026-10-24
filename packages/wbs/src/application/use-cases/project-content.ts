import type { ProjectWbsCommand } from "../../contracts/dto/project-content.js";
import type { ProjectWbsStore } from "../../contracts/repositories/project-content.js";
import { ContractError } from "@line_bot_v1/contract/domain/error";
import { importContractWorkPackage, reviseWbsContent } from "../../domain/content.js";
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
    const verifyContractLine = async (requireActive: boolean) => {
      if (command.action !== "import-contract") return null;
      try {
        const basis = await transaction.contractLines.verifyLine(
          userId,
          command.source.repositoryId,
          {
            contractId: command.source.contractId,
            contractRevisionId: command.source.contractRevisionId,
            lineId: command.source.lineId,
          },
          { requireActive },
        );
        if (
          basis.content.repositoryId !== command.source.repositoryId ||
          (basis.content.node.kind !== "WORK" && basis.content.node.kind !== "TASK") ||
          basis.content.node.plannedQuantity === null
        )
          throw new WbsError(409, "Contract line does not pin an eligible Content Work/Task.");
        return basis;
      } catch (error) {
        if (error instanceof ContractError)
          throw new WbsError(
            error.status === 409 ? 409 : error.status >= 500 ? 503 : 404,
            "Contract source is not eligible or accessible.",
          );
        throw error;
      }
    };
    const replay = await transaction.replay();
    if (replay) {
      if (command.action === "import-contract") await verifyContractLine(false);
      return replay;
    }
    if (transaction.scope.closed) throw new WbsError(409, "Project 已關閉，不能修改 WBS。");
    const current = await transaction.load();
    if (command.action === "import-contract") {
      const basis = await verifyContractLine(true);
      if (!basis) throw new WbsError(503, "Contract source verification is unavailable.");
      const revision = importContractWorkPackage(
        current,
        command.expectedVersion,
        command.node,
        userId,
        transaction.nextId(),
        now,
      );
      return transaction.save(revision, {
        repositoryId: command.source.repositoryId,
        contractId: basis.contractId,
        contractRevisionId: basis.contractRevisionId,
        lineId: basis.lineId,
        planRevisionId: basis.content.planRevisionId,
        contentNodeId: basis.content.node.id,
        nodeId: command.node.id,
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
