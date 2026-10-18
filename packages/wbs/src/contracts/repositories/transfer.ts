import type {
  WbsTransferDependentCounts,
  WbsTransferProjectFacts,
  WbsTransferSnapshot,
  WbsTransferSourceFacts,
} from "../../domain/transfer.js";
import type {
  CancelWbsScopeTransferCommand,
  RequestWbsScopeTransferCommand,
  WbsScopeTransfer,
} from "../dto/transfer.js";

export interface WbsTransferRequestTransaction {
  replay(): Promise<WbsScopeTransfer | null>;
  source(): Promise<WbsTransferSourceFacts>;
  project(): Promise<WbsTransferProjectFacts>;
  snapshot(): Promise<WbsTransferSnapshot>;
  dependents(): Promise<WbsTransferDependentCounts>;
  destinationEmpty(): Promise<boolean>;
  save(snapshot: WbsTransferSnapshot): Promise<WbsScopeTransfer>;
}

export interface WbsTransferCancelTransaction {
  load(): Promise<WbsScopeTransfer>;
  source(): Promise<WbsTransferSourceFacts>;
  cancel(transfer: WbsScopeTransfer): Promise<WbsScopeTransfer>;
}

export interface WbsTransferExecutionTransaction {
  load(): Promise<WbsScopeTransfer>;
  source(actorUserId: string, repositoryId: string): Promise<WbsTransferSourceFacts>;
  project(actorUserId: string, projectId: string): Promise<WbsTransferProjectFacts>;
  snapshot(repositoryId: string): Promise<WbsTransferSnapshot>;
  dependents(
    actorUserId: string,
    repositoryId: string,
    projectId: string,
  ): Promise<WbsTransferDependentCounts>;
  destinationEmpty(projectId: string): Promise<boolean>;
  activate(
    transfer: WbsScopeTransfer,
    releaseSha: string,
    activatedAt: number,
  ): Promise<WbsScopeTransfer>;
}

export interface WbsScopeTransferStore {
  readActive(transferId: string): Promise<WbsScopeTransfer | null>;
  readCurrent(
    actorUserId: string,
    repositoryId: string,
  ): Promise<Readonly<{ transfer: WbsScopeTransfer | null; source: WbsTransferSourceFacts }>>;
  request<T>(
    actorUserId: string,
    command: RequestWbsScopeTransferCommand,
    requestedAt: number,
    operation: (transaction: WbsTransferRequestTransaction) => Promise<T>,
  ): Promise<T>;
  execute<T>(
    transferId: string,
    operation: (transaction: WbsTransferExecutionTransaction) => Promise<T>,
  ): Promise<T>;
  cancel<T>(
    actorUserId: string,
    command: CancelWbsScopeTransferCommand,
    cancelledAt: number,
    operation: (transaction: WbsTransferCancelTransaction) => Promise<T>,
  ): Promise<T>;
}
