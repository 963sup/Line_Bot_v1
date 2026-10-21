import type { ResourceRevision } from "../../domain/resource.js";
import type { ResourceList } from "../dto/resources.js";
import type { Resources } from "../repositories/resources.js";

export interface ResourceReads {
  list(userId: string, repositoryId: string, after?: string): Promise<ResourceList>;
  read(
    userId: string,
    query: Readonly<{ repositoryId: string; resourceId: string; revisionId?: string }>,
  ): Promise<ResourceRevision>;
  history(
    userId: string,
    query: Readonly<{ repositoryId: string; resourceId: string }>,
    before?: number,
  ): Promise<{ revisions: readonly ResourceRevision[]; next: number | null }>;
}

export interface ResourceTransaction {
  readonly scope: { repositoryId: string; permissions: readonly string[]; archived: boolean };
  readonly resources: Resources;
  nextId(): string;
  replay(): Promise<{ requestId: string; revision: ResourceRevision } | null>;
  record(revision: ResourceRevision): Promise<void>;
}

export interface ResourceTransactions {
  transact<T>(
    userId: string,
    scope: Readonly<{ repositoryId: string; resourceId: string }>,
    evidence: Readonly<{ requestId: string; payload: string }>,
    operation: (tx: ResourceTransaction) => Promise<T>,
  ): Promise<T>;
}
