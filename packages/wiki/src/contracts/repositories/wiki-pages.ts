import type { WikiRevision } from "../../domain/wiki-page.js";
import type {
  WikiCommand,
  WikiHistory,
  WikiPageSummary,
  WikiQuery,
  WikiReceipt,
} from "../dto/wiki.js";

export interface WikiTransaction {
  readonly scope: { repositoryId: string; permissions: readonly string[]; archived: boolean };
  nextId(): string;
  replay(): Promise<WikiReceipt | null>;
  load(): Promise<WikiRevision | null>;
  revision(id: string): Promise<WikiRevision | null>;
  save(next: WikiRevision): Promise<WikiReceipt>;
}
export interface WikiStore {
  list(
    userId: string,
    repositoryId: string,
    after?: string,
  ): Promise<{ pages: WikiPageSummary[]; next: string | null }>;
  read(userId: string, query: WikiQuery): Promise<WikiRevision>;
  history(userId: string, query: WikiQuery, before?: number): Promise<WikiHistory>;
  transact<T>(
    userId: string,
    command: WikiCommand,
    operation: (tx: WikiTransaction) => Promise<T>,
  ): Promise<T>;
}
