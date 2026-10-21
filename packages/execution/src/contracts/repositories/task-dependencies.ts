import type { TaskDependencyRevision } from "../../domain/task-dependencies.js";

export interface TaskDependencies {
  load(): Promise<TaskDependencyRevision | null>;
  save(next: TaskDependencyRevision, expectedVersion: number): Promise<void>;
}
