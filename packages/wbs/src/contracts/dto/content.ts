import type { WbsRevision } from "../../domain/content.js";
import type { WbsEdit } from "../../domain/document.js";

export type WbsCommand = WbsEdit &
  Readonly<{ repositoryId: string; requestId: string; expectedVersion: number }>;
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
