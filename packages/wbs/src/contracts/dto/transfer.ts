import type { WbsScopeTransferState } from "../../domain/transfer.js";

export type RequestWbsScopeTransferCommand = Readonly<{
  transferId: string;
  requestId: string;
  repositoryId: string;
  projectId: string;
  sourceVersion: number;
  sourceHeadRevisionId: string;
}>;

export type ExecuteWbsScopeTransferCommand = Readonly<{
  transferId: string;
  currentMainSha: string;
  deployedSha: string;
  providerRecoveryReady: boolean;
}>;

export type CancelWbsScopeTransferCommand = Readonly<{
  transferId: string;
  repositoryId: string;
  requestId: string;
}>;

export type WbsScopeTransfer = Readonly<{
  id: string;
  repositoryId: string;
  projectId: string;
  actorUserId: string;
  requestId: string;
  state: WbsScopeTransferState;
  sourceVersion: number;
  sourceHeadRevisionId: string;
  revisionCount: number;
  commandCount: number;
  sourceHash: string;
  requestedAt: number;
  activatedAt: number | null;
  releaseSha: string | null;
  cancelledAt: number | null;
  cancelRequestId: string | null;
}>;
