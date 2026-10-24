import type { FileSavedResultReader } from "@line_bot_v1/file/contracts/output/saved-results";
import type { ResourceReferenceReader } from "@line_bot_v1/resources/contracts/output/resource-references";
import type { ContentPlanRevision } from "../../domain/plan.js";
import type { ContentPlans } from "../repositories/plans.js";

export interface ContentPlanReads {
  read(
    userId: string,
    query: Readonly<{ repositoryId: string; revisionId?: string }>,
  ): Promise<ContentPlanRevision>;
  history(
    userId: string,
    query: Readonly<{ repositoryId: string }>,
    before?: number,
  ): Promise<{ revisions: readonly ContentPlanRevision[]; next: number | null }>;
}

export interface ContentPlanTransaction {
  readonly scope: { repositoryId: string; permissions: readonly string[]; archived: boolean };
  readonly plans: ContentPlans;
  readonly resources: ResourceReferenceReader;
  readonly savedFileResults: FileSavedResultReader;
  nextId(): string;
  replay(): Promise<{ requestId: string; revision: ContentPlanRevision } | null>;
  record(revision: ContentPlanRevision): Promise<void>;
}

export interface ContentPlanTransactions {
  transact<T>(
    userId: string,
    scope: Readonly<{ repositoryId: string }>,
    evidence: Readonly<{ requestId: string; payload: string }>,
    operation: (tx: ContentPlanTransaction) => Promise<T>,
  ): Promise<T>;
}
