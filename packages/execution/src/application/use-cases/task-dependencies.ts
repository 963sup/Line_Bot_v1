import { taskDependencyRevisionDto } from "../../contracts/dto/task-dependencies.js";
import type {
  TaskDependencyReads,
  TaskDependencyTransactions,
} from "../../contracts/output/task-dependencies.js";
import { ExecutionError, executionErrorFromUnknown } from "../../domain/error.js";
import { canSubmitExecution } from "../../domain/policies/access.js";
import { reviseTaskDependencies } from "../../domain/task-dependencies.js";
import { parseTaskDependencyCommand } from "../commands/task-dependencies.js";
import { executionId, repositoryId } from "../queries/executions.js";

export function createTaskDependencies(deps: {
  reads: TaskDependencyReads;
  transactions: TaskDependencyTransactions;
  now(): number;
}) {
  return {
    async read(userId: string, query: { repositoryId: string; planRevisionId: string }) {
      try {
        if (
          !query ||
          typeof query !== "object" ||
          Array.isArray(query) ||
          Object.keys(query).some((key) => !["repositoryId", "planRevisionId"].includes(key))
        )
          throw new ExecutionError(400, "Invalid Task dependency query.", "INVALID_INPUT");
        return await deps.reads.read(userId, {
          repositoryId: repositoryId(query.repositoryId),
          planRevisionId: executionId(query.planRevisionId),
        });
      } catch (error) {
        throw executionErrorFromUnknown(error);
      }
    },
    async execute(userId: string, input: unknown) {
      const command = parseTaskDependencyCommand(input);
      try {
        return await deps.transactions.transact(
          userId,
          { repositoryId: command.repositoryId, planRevisionId: command.planRevisionId },
          { requestId: command.requestId, payload: JSON.stringify(command) },
          async (tx) => {
            if (!canSubmitExecution(tx.scope.permissions))
              throw new ExecutionError(
                403,
                "Task dependency replacement requires write, maintain or admin.",
                "FORBIDDEN",
              );
            const replay = await tx.replay();
            if (replay)
              return {
                requestId: replay.requestId,
                revision: taskDependencyRevisionDto(replay.revision),
              };
            if (tx.scope.archived)
              throw new ExecutionError(409, "Repository is archived.", "CONFLICT");
            const current = await tx.dependencies.load();
            await tx.content.verifyRevision(userId, tx.scope.repositoryId, command.planRevisionId);
            const taskIds = [
              ...new Set(command.edges.flatMap((edge) => [edge.taskId, edge.prerequisiteTaskId])),
            ].sort();
            const tasks = await tx.content.verifyPinned(
              userId,
              tx.scope.repositoryId,
              taskIds.map((nodeId) => ({ planRevisionId: command.planRevisionId, nodeId })),
            );
            const revision = reviseTaskDependencies(
              current,
              command.expectedVersion,
              command.edges,
              tasks,
              {
                id: tx.nextId(),
                repositoryId: tx.scope.repositoryId,
                planRevisionId: command.planRevisionId,
                actorUserId: userId,
                at: deps.now(),
              },
            );
            await tx.dependencies.save(revision, command.expectedVersion);
            await tx.record(revision);
            return { requestId: command.requestId, revision: taskDependencyRevisionDto(revision) };
          },
        );
      } catch (error) {
        throw executionErrorFromUnknown(error);
      }
    },
  };
}
