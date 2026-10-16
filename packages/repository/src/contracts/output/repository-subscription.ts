import type {
  RepositoryLifecycleState,
  RepositorySubscriptionDecision,
  RepositorySubscriptionRecord,
} from "../../domain/repository/entities/repository.js";

export type RepositorySubscriptionScope = Pick<RepositoryLifecycleState, "id">;

export type RepositorySubscriptionEvidence = Readonly<{
  matches: boolean;
  value: unknown;
}>;

export interface RepositorySubscriptionTransaction {
  hasCurrentUpdateQualification(userId: string): Promise<boolean>;
  authorizedRepository(userId: string, repositoryId: string): Promise<RepositorySubscriptionScope>;
  lockRequest(userId: string, requestId: string): Promise<void>;
  evidence(
    userId: string,
    requestId: string,
    payload: string,
  ): Promise<RepositorySubscriptionEvidence | null>;
  lockPair(repositoryId: string, userId: string): Promise<void>;
  currentForUpdate(
    repositoryId: string,
    userId: string,
  ): Promise<RepositorySubscriptionRecord | null>;
  save(
    repositoryId: string,
    userId: string,
    decision: RepositorySubscriptionDecision,
    now: number,
  ): Promise<boolean>;
  record(args: {
    actorUserId: string;
    requestId: string;
    payload: string;
    evidence: unknown;
    at: number;
  }): Promise<void>;
}

export interface RepositorySubscriptionPersistence {
  transact<T>(work: (transaction: RepositorySubscriptionTransaction) => Promise<T>): Promise<T>;
}
