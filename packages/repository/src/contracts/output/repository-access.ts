import type {
  RepositoryAccessGrantState,
  RepositoryAccessMutation,
  RepositoryAccessScope,
} from "../../domain/repository/entities/repository.js";
import type { RepositoryAccessReceipt } from "../input/repository-access.js";

export type RepositoryAccessEvidence = Readonly<{
  matches: boolean;
  value: unknown;
}>;

export type RepositoryAccessMutationResult = Readonly<{
  capability: RepositoryAccessReceipt["capability"];
  version: RepositoryAccessReceipt["version"];
}>;

export interface RepositoryAccessTransaction {
  hasCurrentUpdateQualification(userId: string): Promise<boolean>;
  load(repositoryId: string): Promise<RepositoryAccessScope | null>;
  hasCurrentAdmin(repositoryId: string, userId: string): Promise<boolean>;
  lockRequest(userId: string, requestId: string): Promise<void>;
  evidence(
    userId: string,
    requestId: string,
    payload: string,
  ): Promise<RepositoryAccessEvidence | null>;
  currentGrant(
    repositoryId: string,
    subjectKind: RepositoryAccessMutation["subjectKind"],
    subjectId: string,
  ): Promise<RepositoryAccessGrantState | null>;
  targetUserActive(userId: string): Promise<boolean>;
  mutate(
    actorUserId: string,
    repositoryId: string,
    mutation: RepositoryAccessMutation,
  ): Promise<RepositoryAccessMutationResult>;
  record(args: {
    actorUserId: string;
    requestId: string;
    payload: string;
    evidence: unknown;
    at: number;
  }): Promise<void>;
}

export interface RepositoryAccessPersistence {
  transact<T>(work: (transaction: RepositoryAccessTransaction) => Promise<T>): Promise<T>;
}
