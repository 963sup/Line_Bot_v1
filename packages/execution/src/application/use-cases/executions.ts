import type { ContractLineReference } from "@line_bot_v1/contract/contracts/output/references";
import type { ExecutionReceipt, ExecutionRevisionDto } from "../../contracts/dto/executions.js";
import type { ExecutionReads, ExecutionTransactions } from "../../contracts/output/executions.js";
import { ExecutionError, executionErrorFromUnknown } from "../../domain/error.js";
import { reviseExecution } from "../../domain/execution.js";
import { canReviewExecution, canSubmitExecution } from "../../domain/policies/access.js";
import { parseExecutionCommand } from "../commands/executions.js";
import { executionId, historyCursor, repositoryId } from "../queries/executions.js";

function dto(revision: Awaited<ReturnType<ExecutionReads["read"]>>): ExecutionRevisionDto {
  return {
    revisionId: revision.id,
    executionId: revision.executionId,
    repositoryId: revision.repositoryId,
    version: revision.version,
    parentRevisionId: revision.parentRevisionId,
    actorUserId: revision.actorUserId,
    at: revision.at,
    action: revision.action,
    state: revision.state,
    basis: {
      contractId: revision.basis.contractId,
      contractRevisionId: revision.basis.contractRevisionId,
      lineId: revision.basis.lineId,
      agreedQuantity: revision.basis.agreedQuantity,
      resource: {
        resourceId: revision.basis.resource.resourceId,
        resourceRevisionId: revision.basis.resource.resourceRevisionId,
        resourceVersion: revision.basis.resource.resourceVersion,
        name: revision.basis.resource.name,
        measure: {
          id: revision.basis.resource.measure.id,
          name: revision.basis.resource.measure.name,
          subject: revision.basis.resource.measure.subject,
          unit: revision.basis.resource.measure.unit,
        },
        sourceQuantity: revision.basis.resource.sourceQuantity,
      },
    },
    quantity: revision.quantity,
    note: revision.note,
    reason: revision.reason,
  };
}

function sourceError(error: unknown): never {
  if (error instanceof ExecutionError) throw error;
  if (error && typeof error === "object") {
    const status = Reflect.get(error, "status");
    if (typeof status === "number") {
      const code =
        status === 403
          ? "FORBIDDEN"
          : status === 400
            ? "INVALID_INPUT"
            : status === 404
              ? "NOT_FOUND"
              : status === 409
                ? "CONFLICT"
                : "UNAVAILABLE";
      throw new ExecutionError(status, "Execution source verification failed.", code);
    }
  }
  throw error;
}

function strictQuery(value: object, allowed: readonly string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new ExecutionError(400, "Invalid Execution query.", "INVALID_INPUT");
}

export function createExecutions(deps: {
  reads: ExecutionReads;
  transactions: ExecutionTransactions;
  now(): number;
}) {
  return {
    async read(
      userId: string,
      query: { repositoryId: string; executionId: string; revisionId?: string },
    ) {
      try {
        strictQuery(query, ["repositoryId", "executionId", "revisionId"]);
        return dto(
          await deps.reads.read(userId, {
            repositoryId: repositoryId(query.repositoryId),
            executionId: executionId(query.executionId),
            ...(query.revisionId === undefined
              ? {}
              : { revisionId: executionId(query.revisionId) }),
          }),
        );
      } catch (error) {
        throw executionErrorFromUnknown(error);
      }
    },
    async list(
      userId: string,
      query: { repositoryId: string; contractId: string },
      after?: string,
    ) {
      try {
        strictQuery(query, ["repositoryId", "contractId"]);
        return await deps.reads.list(
          userId,
          {
            repositoryId: repositoryId(query.repositoryId),
            contractId: executionId(query.contractId),
          },
          after === undefined ? undefined : executionId(after),
        );
      } catch (error) {
        throw executionErrorFromUnknown(error);
      }
    },
    async history(
      userId: string,
      query: { repositoryId: string; executionId: string },
      before?: number,
    ) {
      try {
        strictQuery(query, ["repositoryId", "executionId"]);
        const page = await deps.reads.history(
          userId,
          {
            repositoryId: repositoryId(query.repositoryId),
            executionId: executionId(query.executionId),
          },
          historyCursor(before),
        );
        return { revisions: page.revisions.map(dto), next: page.next };
      } catch (error) {
        throw executionErrorFromUnknown(error);
      }
    },
    async execute(userId: string, input: unknown): Promise<ExecutionReceipt> {
      const command = parseExecutionCommand(input);
      return deps.transactions
        .transact(
          userId,
          { repositoryId: command.repositoryId, executionId: command.executionId },
          { requestId: command.requestId, payload: JSON.stringify(command) },
          async (tx) => {
            const allowed =
              command.action === "submit"
                ? canSubmitExecution(tx.scope.permissions)
                : canReviewExecution(tx.scope.permissions);
            if (!allowed)
              throw new ExecutionError(
                403,
                command.action === "submit"
                  ? "Execution submission requires write, maintain or admin."
                  : "Execution review requires admin.",
                "FORBIDDEN",
              );
            const replay = await tx.replay();
            if (replay) return { requestId: replay.requestId, revision: dto(replay.revision) };
            if (tx.scope.archived)
              throw new ExecutionError(409, "Repository is archived.", "CONFLICT");
            const current = await tx.executions.load();
            let reference: ContractLineReference;
            if (command.action === "submit") {
              reference = {
                contractId: command.contractId,
                contractRevisionId: command.contractRevisionId,
                lineId: command.lineId,
              };
            } else {
              if (!current)
                throw new ExecutionError(404, "Execution report not found.", "NOT_FOUND");
              reference = {
                contractId: current.basis.contractId,
                contractRevisionId: current.basis.contractRevisionId,
                lineId: current.basis.lineId,
              };
            }
            const basis = await tx.references
              .verifyLine(userId, tx.scope.repositoryId, reference, {
                requireActive: command.action === "submit",
              })
              .catch(sourceError);
            const revision = reviseExecution(
              current,
              command.expectedVersion,
              command,
              {
                id: tx.nextId(),
                executionId: command.executionId,
                repositoryId: tx.scope.repositoryId,
                actorUserId: userId,
                at: deps.now(),
              },
              basis,
            );
            await tx.executions.save(revision, command.expectedVersion);
            await tx.record(revision);
            return { requestId: command.requestId, revision: dto(revision) };
          },
        )
        .catch((error: unknown) => {
          throw executionErrorFromUnknown(error);
        });
    },
  };
}
