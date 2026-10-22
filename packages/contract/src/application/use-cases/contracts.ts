import type {
  ContractHistory,
  ContractList,
  ContractReceipt,
  ContractRevisionDto,
} from "../../contracts/dto/contracts.js";
import type { ContractReads, ContractTransactions } from "../../contracts/output/contracts.js";
import {
  assertContractTransition,
  type ContractEdit,
  type ContractLineInput,
  type ContractRevision,
  freezeContractLines,
  reviseContract,
} from "../../domain/contract.js";
import { ContractError, contractErrorFromUnknown } from "../../domain/error.js";
import { canAdminContract, canEditContract } from "../../domain/policies/access.js";
import { parseContractCommand } from "../commands.js";
import {
  type ContractQuery,
  contractHistoryQuery,
  contractId,
  contractQuery,
  historyCursor,
  repositoryId,
} from "../queries.js";
import { contractRevisionDto } from "./revision-dto.js";

function contentInputs(current: ContractRevision): ContractLineInput[] {
  return current.lines.map((line) => {
    return {
      lineId: line.lineId,
      planRevisionId: line.content.planRevisionId,
      nodeId: line.content.node.id,
      agreedQuantity: line.agreedQuantity,
    };
  });
}

export function createContracts(deps: {
  reads: ContractReads;
  transactions: ContractTransactions;
  now(): number;
}) {
  return {
    async list(userId: string, scope: string, after?: string): Promise<ContractList> {
      try {
        return await deps.reads.list(
          userId,
          repositoryId(scope),
          after === undefined ? undefined : contractId(after),
        );
      } catch (error) {
        throw contractErrorFromUnknown(error);
      }
    },
    async read(userId: string, query: ContractQuery): Promise<ContractRevisionDto> {
      try {
        return contractRevisionDto(await deps.reads.read(userId, contractQuery(query)));
      } catch (error) {
        throw contractErrorFromUnknown(error);
      }
    },
    async history(
      userId: string,
      query: Omit<ContractQuery, "revisionId">,
      before?: number,
    ): Promise<ContractHistory> {
      try {
        const scope = contractHistoryQuery(query);
        const page = await deps.reads.history(userId, scope, historyCursor(before));
        return { revisions: page.revisions.map(contractRevisionDto), next: page.next };
      } catch (error) {
        throw contractErrorFromUnknown(error);
      }
    },
    async execute(userId: string, input: unknown): Promise<ContractReceipt> {
      const command = parseContractCommand(input);
      try {
        return await deps.transactions.transact(
          userId,
          { repositoryId: command.repositoryId, contractId: command.contractId },
          { requestId: command.requestId, payload: JSON.stringify(command) },
          async (tx) => {
            const permitted =
              command.action === "activate" || command.action === "close"
                ? canAdminContract(tx.scope.permissions)
                : canEditContract(tx.scope.permissions);
            if (!permitted)
              throw new ContractError(403, "Contract action is not permitted.", "FORBIDDEN");
            const replay = await tx.replay();
            if (replay)
              return {
                requestId: replay.requestId,
                revision: contractRevisionDto(replay.revision),
              };
            if (tx.scope.archived)
              throw new ContractError(409, "Repository is archived.", "LIFECYCLE_CONFLICT");
            const current = await tx.contracts.load();
            assertContractTransition(current, command.expectedVersion, command.action);
            let edit: ContractEdit;
            if (command.action === "create" || command.action === "edit") {
              const contentLines = command.lines;
              const contentItems = await tx.content.verifyPinned(
                userId,
                tx.scope.repositoryId,
                contentLines.map(({ planRevisionId, nodeId }) => ({
                  planRevisionId,
                  nodeId,
                })),
              );
              edit = {
                action: command.action,
                title: command.title,
                body: command.body,
                lines: freezeContractLines(contentLines, contentItems),
              } as const;
            } else if (command.action === "activate") {
              if (!current)
                throw new ContractError(409, "Contract lifecycle conflict.", "LIFECYCLE_CONFLICT");
              const inputs = contentInputs(current);
              const contentItems = await tx.content.verifyPinned(
                userId,
                tx.scope.repositoryId,
                inputs.map(({ planRevisionId, nodeId }) => ({
                  planRevisionId,
                  nodeId,
                })),
              );
              edit = {
                action: "activate",
                lines: freezeContractLines(inputs, contentItems),
              } as const;
            } else edit = { action: "close" } as const;
            const revision = reviseContract(current, command.expectedVersion, edit, {
              id: tx.nextId(),
              contractId: command.contractId,
              repositoryId: tx.scope.repositoryId,
              actorUserId: userId,
              at: deps.now(),
            });
            await tx.contracts.save(revision, command.expectedVersion);
            await tx.record(revision);
            return { requestId: command.requestId, revision: contractRevisionDto(revision) };
          },
        );
      } catch (error) {
        throw contractErrorFromUnknown(error);
      }
    },
  };
}
