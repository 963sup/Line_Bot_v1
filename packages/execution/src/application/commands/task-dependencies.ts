import { ExecutionError } from "../../domain/error.js";
import type { TaskDependencyEdge } from "../../domain/task-dependencies.js";

export type ReplaceTaskDependenciesCommand = Readonly<{
  action: "replace";
  repositoryId: string;
  planRevisionId: string;
  requestId: string;
  expectedVersion: number;
  edges: readonly TaskDependencyEdge[];
}>;

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function id(value: unknown) {
  if (typeof value !== "string" || !uuid.test(value))
    throw new ExecutionError(400, "Invalid Task dependency identifier.", "INVALID_INPUT");
  return value.toLowerCase();
}

export function parseTaskDependencyCommand(input: unknown): ReplaceTaskDependenciesCommand {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ExecutionError(400, "Invalid Task dependency command.", "INVALID_INPUT");
  const value: Record<string, unknown> = { ...input };
  if (
    value.action !== "replace" ||
    typeof value.repositoryId !== "string" ||
    value.repositoryId.length < 1 ||
    value.repositoryId.length > 128 ||
    typeof value.expectedVersion !== "number" ||
    !Number.isSafeInteger(value.expectedVersion) ||
    value.expectedVersion < 0 ||
    value.expectedVersion >= 2_147_483_647 ||
    !Array.isArray(value.edges) ||
    value.edges.length > 1000
  )
    throw new ExecutionError(400, "Invalid Task dependency command.", "INVALID_INPUT");
  const edges = value.edges.map((inputEdge): TaskDependencyEdge => {
    if (!inputEdge || typeof inputEdge !== "object" || Array.isArray(inputEdge))
      throw new ExecutionError(400, "Invalid Task dependency edge.", "INVALID_INPUT");
    const edge: Record<string, unknown> = { ...inputEdge };
    if (Object.keys(edge).some((key) => !["taskId", "prerequisiteTaskId"].includes(key)))
      throw new ExecutionError(400, "Unknown Task dependency edge field.", "INVALID_INPUT");
    return { taskId: id(edge.taskId), prerequisiteTaskId: id(edge.prerequisiteTaskId) };
  });
  const command: ReplaceTaskDependenciesCommand = {
    action: "replace",
    repositoryId: value.repositoryId,
    planRevisionId: id(value.planRevisionId),
    requestId: id(value.requestId),
    expectedVersion: value.expectedVersion,
    edges: edges.sort(
      (left, right) =>
        left.taskId.localeCompare(right.taskId) ||
        left.prerequisiteTaskId.localeCompare(right.prerequisiteTaskId),
    ),
  };
  if (Object.keys(value).some((key) => !Object.hasOwn(command, key)))
    throw new ExecutionError(400, "Unknown Task dependency command field.", "INVALID_INPUT");
  return command;
}
