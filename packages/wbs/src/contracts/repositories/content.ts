import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import type { WbsRevision } from "../../domain/content.js";
import type { WbsCommand, WbsHistory, WbsReceipt, WbsView } from "../dto/content.js";

export type WbsWriteScope = Readonly<{
  repositoryId: string;
  archived: boolean;
  permissions: readonly string[];
}>;

/** All callbacks execute under the same Repository locks and database transaction. */
export interface WbsContentTransaction {
  readonly scope: WbsWriteScope;
  replay(): Promise<WbsReceipt | null>;
  load(): Promise<WbsRevision | null>;
  nextId(): string;
  save(revision: WbsRevision): Promise<WbsReceipt>;
}

export interface WbsStore {
  read(userId: string, selector: RepositorySelector, revisionId?: string): Promise<WbsView>;
  history(userId: string, selector: RepositorySelector, before?: number): Promise<WbsHistory>;
  transact<T>(
    userId: string,
    command: WbsCommand,
    operation: (transaction: WbsContentTransaction) => Promise<T>,
  ): Promise<T>;
}
