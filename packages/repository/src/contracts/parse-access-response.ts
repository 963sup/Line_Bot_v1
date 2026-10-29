import { isRecord } from "@line_bot_v1/platform/validation";
import {
  type RepositoryPermission,
  repositoryPermissions,
} from "../domain/repository/value-objects/repository-capability.js";
import type {
  RepositoryAccessCommand,
  RepositoryAccessSnapshot,
} from "./input/repository-access.js";

export function isPermission(value: unknown): value is RepositoryPermission {
  return (
    typeof value === "string" && repositoryPermissions.some((permission) => permission === value)
  );
}

export function isAccessCommand(value: unknown): value is RepositoryAccessCommand {
  return (
    isRecord(value) &&
    (value.action === "grant" || value.action === "revoke") &&
    (value.subjectKind === "USER" || value.subjectKind === "TEAM") &&
    typeof value.requestId === "string" &&
    typeof value.repositoryId === "string" &&
    typeof value.subjectId === "string" &&
    Number.isSafeInteger(value.expectedVersion) &&
    (value.action === "revoke" || isPermission(value.capability))
  );
}

export function isAccessSnapshot(
  value: unknown,
): value is RepositoryAccessSnapshot & { error?: string } {
  return (
    isRecord(value) &&
    isRecord(value.repository) &&
    typeof value.repository.id === "string" &&
    typeof value.repository.ownerLogin === "string" &&
    typeof value.repository.name === "string" &&
    (value.repository.ownerKind === "USER" || value.repository.ownerKind === "ORGANIZATION") &&
    Array.isArray(value.repository.actorPermissions) &&
    value.repository.actorPermissions.every(isPermission) &&
    Array.isArray(value.directUserGrants) &&
    Array.isArray(value.teamGrants) &&
    value.directUserGrants.every(
      (grant) =>
        isRecord(grant) &&
        typeof grant.userId === "string" &&
        isPermission(grant.capability) &&
        Number.isSafeInteger(grant.version) &&
        typeof grant.isOutsideCollaborator === "boolean",
    ) &&
    value.teamGrants.every(
      (grant) =>
        isRecord(grant) &&
        typeof grant.teamId === "string" &&
        isPermission(grant.capability) &&
        Number.isSafeInteger(grant.version),
    )
  );
}
