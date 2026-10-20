import type { ContractReferenceReader } from "@line_bot_v1/contract/contracts/output/references";
import type { ExecutionRevision } from "../../domain/execution.js";
import type { ExecutionSummary } from "../dto/executions.js";
import type { Executions } from "../repositories/executions.js";

export interface ExecutionReads {
  read(
    userId: string,
    query: { repositoryId: string; executionId: string; revisionId?: string },
  ): Promise<ExecutionRevision>;
  list(
    userId: string,
    query: { repositoryId: string; contractId: string },
    after?: string,
  ): Promise<{ executions: readonly ExecutionSummary[]; next: string | null }>;
  history(
    userId: string,
    query: { repositoryId: string; executionId: string },
    before?: number,
  ): Promise<{ revisions: readonly ExecutionRevision[]; next: number | null }>;
}
export interface ExecutionTransaction {
  readonly scope: { repositoryId: string; permissions: readonly string[]; archived: boolean };
  readonly executions: Executions;
  readonly references: ContractReferenceReader;
  nextId(): string;
  replay(): Promise<{ requestId: string; revision: ExecutionRevision } | null>;
  record(revision: ExecutionRevision): Promise<void>;
}
export interface ExecutionTransactions {
  transact<T>(
    userId: string,
    scope: { repositoryId: string; executionId: string },
    evidence: { requestId: string; payload: string },
    operation: (tx: ExecutionTransaction) => Promise<T>,
  ): Promise<T>;
}
