import type { ContentPlanReferenceReader } from "@line_bot_v1/content/contracts/output/plan-references";
import type { ContractRevision } from "../../domain/contract.js";
import type { ContractSummary } from "../dto/contracts.js";

interface Contracts {
  load(): Promise<ContractRevision | null>;
  save(next: ContractRevision, expectedVersion: number): Promise<void>;
}

export interface ContractReads {
  list(
    userId: string,
    repositoryId: string,
    after?: string,
  ): Promise<{ contracts: ContractSummary[]; next: string | null }>;
  read(
    userId: string,
    query: Readonly<{ repositoryId: string; contractId: string; revisionId?: string }>,
  ): Promise<ContractRevision>;
  history(
    userId: string,
    query: Readonly<{ repositoryId: string; contractId: string }>,
    before?: number,
  ): Promise<{ revisions: readonly ContractRevision[]; next: number | null }>;
}

export interface ContractTransaction {
  readonly scope: { repositoryId: string; permissions: readonly string[]; archived: boolean };
  readonly contracts: Contracts;
  readonly content: ContentPlanReferenceReader;
  nextId(): string;
  replay(): Promise<{ requestId: string; revision: ContractRevision } | null>;
  record(revision: ContractRevision): Promise<void>;
}

export interface ContractTransactions {
  transact<T>(
    userId: string,
    scope: Readonly<{ repositoryId: string; contractId: string }>,
    evidence: Readonly<{ requestId: string; payload: string }>,
    operation: (tx: ContractTransaction) => Promise<T>,
  ): Promise<T>;
}
