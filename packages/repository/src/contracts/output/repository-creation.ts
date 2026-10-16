import type {
  RepositoryLifecycleState,
  RepositoryVisibility,
} from "../../domain/repository/entities/repository.js";
import type { RepositoryCreationResult } from "../input/repository-creation.js";

export type RepositoryCreationEvidence = Readonly<{
  matches: boolean;
  value: unknown;
}>;

export type RepositoryProvisionResult =
  | "created"
  | "duplicate-name"
  | "internal-scope-changed"
  | "owner-qualification-changed";

export interface RepositoryCreationTransaction {
  hasCurrentUpdateQualification(userId: string): Promise<boolean>;
  organizationCanCreate(
    userId: string,
    organizationAccountId: string,
    visibility: RepositoryVisibility,
  ): Promise<boolean>;
  ownerLogin(
    ownerAccountId: string,
    ownerKind: RepositoryLifecycleState["ownerKind"],
  ): Promise<string | null>;
  internalEligible(organizationAccountId: string): Promise<boolean>;
  lockRequest(userId: string, requestId: string): Promise<void>;
  evidence(
    userId: string,
    requestId: string,
    payload: string,
    legacyPayload: string | null,
  ): Promise<RepositoryCreationEvidence | null>;
  allocateId(): string;
  provision(
    actorUserId: string,
    repository: RepositoryLifecycleState,
  ): Promise<RepositoryProvisionResult>;
  record(args: {
    actorUserId: string;
    requestId: string;
    payload: string;
    evidence: unknown;
    at: number;
  }): Promise<void>;
  result(repositoryId: string, ownerLogin: string): Promise<RepositoryCreationResult | null>;
}

export interface RepositoryCreationPersistence {
  transact<T>(work: (transaction: RepositoryCreationTransaction) => Promise<T>): Promise<T>;
}
