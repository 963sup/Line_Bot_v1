import type { ContentPlanItemBasis } from "@line_bot_v1/content/domain/plan-reference";
import { ExecutionError } from "./error.js";

export type TaskDependencyEdge = Readonly<{
  taskId: string;
  prerequisiteTaskId: string;
}>;

export type TaskDependencyRevision = Readonly<{
  id: string;
  repositoryId: string;
  planRevisionId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  edges: readonly TaskDependencyEdge[];
}>;

function assertAcyclic(edges: readonly TaskDependencyEdge[]) {
  const prerequisites = new Map<string, string[]>();
  for (const edge of edges) {
    const values = prerequisites.get(edge.taskId) ?? [];
    values.push(edge.prerequisiteTaskId);
    prerequisites.set(edge.taskId, values);
  }
  const visiting = new Set<string>();
  const complete = new Set<string>();
  const visit = (taskId: string): void => {
    if (complete.has(taskId)) return;
    if (visiting.has(taskId))
      throw new ExecutionError(409, "Task dependencies must be acyclic.", "CONFLICT");
    visiting.add(taskId);
    for (const prerequisite of prerequisites.get(taskId) ?? []) visit(prerequisite);
    visiting.delete(taskId);
    complete.add(taskId);
  };
  for (const taskId of prerequisites.keys()) visit(taskId);
}

export function reviseTaskDependencies(
  current: TaskDependencyRevision | null,
  expectedVersion: number,
  edges: readonly TaskDependencyEdge[],
  tasks: readonly ContentPlanItemBasis[],
  context: Readonly<{
    id: string;
    repositoryId: string;
    planRevisionId: string;
    actorUserId: string;
    at: number;
  }>,
): TaskDependencyRevision {
  if ((current?.version ?? 0) !== expectedVersion)
    throw new ExecutionError(409, "Task dependency version conflict.", "CONFLICT");
  if (
    current &&
    (current.repositoryId !== context.repositoryId ||
      current.planRevisionId !== context.planRevisionId)
  )
    throw new ExecutionError(409, "Task dependency scope conflict.", "CONFLICT");
  if (edges.length > 1000)
    throw new ExecutionError(400, "Task dependencies cannot exceed 1000 edges.", "INVALID_INPUT");
  const keys = edges.map((edge) => `${edge.taskId}:${edge.prerequisiteTaskId}`);
  if (
    edges.some((edge) => edge.taskId === edge.prerequisiteTaskId) ||
    new Set(keys).size !== edges.length
  )
    throw new ExecutionError(
      400,
      "Task dependency edges must be unique and non-self.",
      "INVALID_INPUT",
    );
  const required = new Set(edges.flatMap((edge) => [edge.taskId, edge.prerequisiteTaskId]));
  const qualified = new Map(tasks.map((task) => [task.node.id, task]));
  if (
    tasks.length !== required.size ||
    [...required].some((id) => {
      const task = qualified.get(id);
      return (
        !task ||
        task.repositoryId !== context.repositoryId ||
        task.planRevisionId !== context.planRevisionId ||
        task.node.kind !== "TASK"
      );
    })
  )
    throw new ExecutionError(409, "Task dependency endpoints are not eligible.", "CONFLICT");
  assertAcyclic(edges);
  return {
    ...context,
    version: expectedVersion + 1,
    parentRevisionId: current?.id ?? null,
    edges: edges.map((edge) => ({ ...edge })),
  };
}
