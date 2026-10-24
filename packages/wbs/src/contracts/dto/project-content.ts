import type { WbsRevision } from "../../domain/content.js";
import type { WbsEdit } from "../../domain/document.js";

export type ProjectWbsContractImport = Readonly<{
  action: "import-contract";
  source: {
    repositoryId: string;
    contractId: string;
    contractRevisionId: string;
    lineId: string;
  };
  node: import("../../domain/document.js").WbsNode;
  acknowledged: true;
}>;
export type ProjectWbsCommand = (WbsEdit | ProjectWbsContractImport) &
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
