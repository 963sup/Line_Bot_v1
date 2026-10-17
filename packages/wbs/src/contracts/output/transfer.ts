import type { WbsTransferProjectFacts, WbsTransferSourceFacts } from "../../domain/transfer.js";

type WbsTransferExternalDependentCounts = Readonly<{
  actionRows: number;
  notificationRows: number;
}>;

/** Concrete owner providers execute inside the WBS transfer transaction. */
export interface WbsTransferScopeReaders {
  repository(actorUserId: string, repositoryId: string): Promise<WbsTransferSourceFacts>;
  project(actorUserId: string, projectId: string): Promise<WbsTransferProjectFacts>;
  dependents(
    actorUserId: string,
    repositoryId: string,
    projectId: string,
  ): Promise<WbsTransferExternalDependentCounts>;
}
