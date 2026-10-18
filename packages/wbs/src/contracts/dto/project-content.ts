import type { WbsRevision } from "../../domain/content.js";
import type { WbsEdit } from "../../domain/document.js";

export type ProjectWbsCommand = WbsEdit &
  Readonly<{ projectId: string; requestId: string; expectedVersion: number }>;
export type ProjectWbsView = Readonly<{
  project: { id: string; title: string };
  actorUserId: string;
  canEdit: boolean;
  canManageProject: boolean;
  closed: boolean;
  version: number;
  revision: WbsRevision | null;
}>;
export type ProjectWbsReceipt = Readonly<{
  requestId: string;
  projectId: string;
  revision: WbsRevision;
}>;
export type ProjectWbsHistory = Readonly<{
  revisions: readonly Omit<WbsRevision, "document">[];
  next: number | null;
}>;
