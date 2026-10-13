import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import type { WbsDocument, WbsEdit } from "./domain.js";

export type WbsCommand = WbsEdit &
  Readonly<{ repositoryId: string; requestId: string; expectedVersion: number }>;
export type WbsRevision = Readonly<{
  id: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  action: WbsEdit["action"];
  at: number;
  document: WbsDocument;
}>;
export type WbsView = Readonly<{
  repository: { id: string; ownerLogin: string; name: string };
  actorUserId: string;
  canEdit: boolean;
  canManageRepository: boolean;
  archived: boolean;
  version: number;
  revision: WbsRevision | null;
}>;
export type WbsReceipt = Readonly<{
  requestId: string;
  repositoryId: string;
  revision: WbsRevision;
}>;
export type WbsHistory = Readonly<{
  revisions: readonly Omit<WbsRevision, "document">[];
  next: number | null;
}>;
export interface WbsStore {
  read(userId: string, selector: RepositorySelector, revisionId?: string): Promise<WbsView>;
  history(userId: string, selector: RepositorySelector, before?: number): Promise<WbsHistory>;
  execute(userId: string, command: WbsCommand, now: number): Promise<WbsReceipt>;
}
