import type { ContentPlanReferenceReader } from "@line_bot_v1/content/contracts/output/plan-references";
import type { TaskDependencyRevision } from "../../domain/task-dependencies.js";
import type { TaskDependencyView } from "../dto/task-dependencies.js";
import type { TaskDependencies } from "../repositories/task-dependencies.js";

export interface TaskDependencyReads {
  read(
    userId: string,
    query: Readonly<{ repositoryId: string; planRevisionId: string }>,
  ): Promise<TaskDependencyView>;
}

export interface TaskDependencyTransaction {
  readonly scope: { repositoryId: string; permissions: readonly string[]; archived: boolean };
  readonly dependencies: TaskDependencies;
  readonly content: ContentPlanReferenceReader;
  nextId(): string;
  replay(): Promise<{ requestId: string; revision: TaskDependencyRevision } | null>;
  record(revision: TaskDependencyRevision): Promise<void>;
}

export interface TaskDependencyTransactions {
  transact<T>(
    userId: string,
    scope: Readonly<{ repositoryId: string; planRevisionId: string }>,
    evidence: Readonly<{ requestId: string; payload: string }>,
    operation: (tx: TaskDependencyTransaction) => Promise<T>,
  ): Promise<T>;
}
