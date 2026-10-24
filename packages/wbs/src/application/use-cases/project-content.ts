import type {
  ContractLineReference,
  ContractReferenceReader,
} from "@line_bot_v1/contract/contracts/output/references";
import { ContractError } from "@line_bot_v1/contract/domain/error";
import type { ProjectWbsCommand } from "../../contracts/dto/project-content.js";
import type { ProjectWbsStore } from "../../contracts/repositories/project-content.js";
import { reviseWbsContent } from "../../domain/content.js";
import { WbsError } from "../../domain/document.js";
import { canEditProjectWbs } from "../../domain/policies/project-access.js";
import { parseProjectWbsCommand } from "../commands/project-content.js";

/** WBS rechecks Contract authority and maps its explicit failures into WBS command outcomes. */
async function verifiedContractLine(
  reader: ContractReferenceReader,
  userId: string,
  source: Readonly<ContractLineReference & { repositoryId: string }>,
  requireActive: boolean,
) {
  try {
    return await reader.verifyLine(userId, source.repositoryId, source, { requireActive });
  } catch (error) {
    if (!(error instanceof ContractError)) throw error;
    if (error.status === 403) throw new WbsError(403, "目前沒有 Contract 來源讀取權限。");
    if (error.status === 404) throw new WbsError(404, "找不到有權讀取的 Contract 來源。");
    if (error.status === 400 || error.status === 409)
      throw new WbsError(409, "Contract 來源已變更或不再符合匯入條件。");
    throw new WbsError(503, "Contract 來源目前無法確認。");
  }
}

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
        await verifiedContractLine(transaction.contracts, userId, command.source, false);
      return replay;
    }
    if (transaction.scope.closed) throw new WbsError(409, "Project 已關閉，不能修改 WBS。");
    const current = await transaction.load();
    if (command.action === "import-contract") {
      if ((current?.version ?? 0) !== command.expectedVersion)
        throw new WbsError(409, "WBS 版本已更新，請重新確認 Contract 映射。");
      const line = await verifiedContractLine(transaction.contracts, userId, command.source, true);
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
