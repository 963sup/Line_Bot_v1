import type { WikiRevision } from "../../domain/wiki-page.js";
import type { WikiPageSummary } from "../dto/wiki.js";
import type { WikiPages } from "../repositories/wiki-pages.js";

export interface WikiReads {
  list(
    userId: string,
    repositoryId: string,
    after?: string,
  ): Promise<{
    pages: WikiPageSummary[];
    next: string | null;
  }>;
  read(
    userId: string,
    scope: { repositoryId: string; pageId: string; revisionId?: string },
  ): Promise<WikiRevision>;
  history(
    userId: string,
    scope: { repositoryId: string; pageId: string },
    before?: number,
  ): Promise<{
    revisions: readonly WikiRevision[];
    next: number | null;
  }>;
}

export interface WikiTransaction {
  readonly scope: { repositoryId: string; permissions: readonly string[]; archived: boolean };
  readonly pages: WikiPages;
  nextId(): string;
  replay(): Promise<{ requestId: string; revision: WikiRevision } | null>;
  record(revision: WikiRevision): Promise<void>;
}

export interface WikiTransactions {
  transact<T>(
    userId: string,
    scope: { repositoryId: string; pageId: string },
    evidence: { requestId: string; payload: string },
    operation: (tx: WikiTransaction) => Promise<T>,
  ): Promise<T>;
}
