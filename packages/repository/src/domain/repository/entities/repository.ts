import type { RepositoryPermission } from "../value-objects/repository-capability.js";

export type RepositoryVisibility = "private" | "internal" | "public";

export type RepositoryAddress = Readonly<{
  address: string | null;
  latitude: number;
  longitude: number;
  radius: number;
}>;

export type RepositorySummary = {
  id: string;
  ownerLogin: string;
  name: string;
  permissions: readonly RepositoryPermission[];
};

export type RepositoryLifecycleState = Readonly<{
  id: string;
  ownerAccountId: string;
  ownerKind: "USER" | "ORGANIZATION";
  name: string;
  visibility: RepositoryVisibility;
  archived: boolean;
  version: number;
}>;

export type RepositoryLifecycleChange =
  | Readonly<{ action: "rename"; expectedVersion: number; name: string }>
  | Readonly<{
      action: "visibility";
      expectedVersion: number;
      visibility: RepositoryVisibility;
    }>
  | Readonly<{ action: "archive" | "unarchive"; expectedVersion: number }>;

export type RepositoryLifecycleFacts = Readonly<{
  nameReserved?: boolean;
  internalEnterpriseId?: string | null;
}>;

export type RepositoryLifecycleDecision = Readonly<{
  action: RepositoryLifecycleChange["action"];
  previous: RepositoryLifecycleState;
  current: RepositoryLifecycleState;
}>;

export type RepositoryLifecycleDecisionResult =
  | Readonly<{ kind: "requires-name-reservation"; name: string }>
  | Readonly<{ kind: "requires-internal-enterprise"; organizationAccountId: string }>
  | Readonly<{ kind: "accepted"; decision: RepositoryLifecycleDecision }>;

export class RepositoryLifecycleError extends Error {
  constructor(
    public readonly code:
      | "version-conflict"
      | "name-unchanged"
      | "name-reserved"
      | "visibility-unchanged"
      | "internal-owner-required"
      | "internal-enterprise-required"
      | "already-archived"
      | "not-archived",
  ) {
    super(code);
    this.name = "RepositoryLifecycleError";
  }
}

export function decideRepositoryLifecycle(
  repository: RepositoryLifecycleState,
  change: RepositoryLifecycleChange,
  facts: RepositoryLifecycleFacts = {},
): RepositoryLifecycleDecisionResult {
  if (repository.version !== change.expectedVersion) {
    throw new RepositoryLifecycleError("version-conflict");
  }

  let current: RepositoryLifecycleState;
  if (change.action === "rename") {
    if (repository.name === change.name) throw new RepositoryLifecycleError("name-unchanged");
    if (facts.nameReserved === undefined) {
      return { kind: "requires-name-reservation", name: change.name };
    }
    if (facts.nameReserved) throw new RepositoryLifecycleError("name-reserved");
    current = { ...repository, name: change.name, version: repository.version + 1 };
  } else if (change.action === "visibility") {
    if (repository.visibility === change.visibility) {
      throw new RepositoryLifecycleError("visibility-unchanged");
    }
    if (change.visibility === "internal") {
      if (repository.ownerKind !== "ORGANIZATION") {
        throw new RepositoryLifecycleError("internal-owner-required");
      }
      if (facts.internalEnterpriseId === undefined) {
        return {
          kind: "requires-internal-enterprise",
          organizationAccountId: repository.ownerAccountId,
        };
      }
      if (!facts.internalEnterpriseId) {
        throw new RepositoryLifecycleError("internal-enterprise-required");
      }
    }
    current = {
      ...repository,
      visibility: change.visibility,
      version: repository.version + 1,
    };
  } else {
    const archived = change.action === "archive";
    if (repository.archived === archived) {
      throw new RepositoryLifecycleError(archived ? "already-archived" : "not-archived");
    }
    current = { ...repository, archived, version: repository.version + 1 };
  }

  return { kind: "accepted", decision: { action: change.action, previous: repository, current } };
}
