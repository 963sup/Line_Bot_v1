import type { TaskDependencyEdge, TaskDependencyRevision } from "../../domain/task-dependencies.js";

export type TaskDependencyRevisionDto = Readonly<{
  id: string;
  repositoryId: string;
  planRevisionId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  edges: readonly TaskDependencyEdge[];
}>;

export type TaskDependencyView = Readonly<{
  repositoryId: string;
  planRevisionId: string;
  version: number;
  revisionId: string | null;
  edges: readonly TaskDependencyEdge[];
}>;

export function taskDependencyRevisionDto(
  revision: TaskDependencyRevision,
): TaskDependencyRevisionDto {
  return { ...revision, edges: revision.edges.map((edge) => ({ ...edge })) };
}
