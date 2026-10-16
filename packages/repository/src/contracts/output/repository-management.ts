import type {
  RepositoryLifecycleDecision,
  RepositoryLifecycleState,
} from "../../domain/repository/entities/repository.js";
export type RepositoryManagementEvidence = Readonly<{
  matches: boolean;
  value: unknown;
}>;

export type RepositoryLifecycleSaveResult = "saved" | "version-conflict" | "duplicate-name";

export interface RepositoryManagementTransaction {
  hasCurrentUpdateQualification(userId: string): Promise<boolean>;
  loadForUpdate(repositoryId: string): Promise<RepositoryLifecycleState | null>;
  hasCurrentAdmin(repositoryId: string, userId: string): Promise<boolean>;
  lockRequest(userId: string, requestId: string): Promise<void>;
  evidence(
    userId: string,
    requestId: string,
    payload: string,
  ): Promise<RepositoryManagementEvidence | null>;
  nameReserved(repository: RepositoryLifecycleState, name: string): Promise<boolean>;
  internalEnterpriseId(organizationAccountId: string): Promise<string | null>;
  save(decision: RepositoryLifecycleDecision, now: number): Promise<RepositoryLifecycleSaveResult>;
  record(args: {
    actorUserId: string;
    requestId: string;
    payload: string;
    decision: RepositoryLifecycleDecision;
    evidence: unknown;
    at: number;
  }): Promise<void>;
}

export interface RepositoryManagementPersistence {
  transact<T>(work: (transaction: RepositoryManagementTransaction) => Promise<T>): Promise<T>;
}
