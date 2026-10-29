import { isRecord } from "@line_bot_v1/platform/validation";
import type {
  RepositoryManagementCommand,
  RepositoryManagementSnapshot,
} from "./input/repository-management.js";

export function isVisibility(value: unknown): value is "private" | "internal" | "public" {
  return value === "private" || value === "internal" || value === "public";
}

export function isManagementCommand(value: unknown): value is RepositoryManagementCommand {
  if (
    !isRecord(value) ||
    typeof value.requestId !== "string" ||
    typeof value.repositoryId !== "string" ||
    !Number.isSafeInteger(value.expectedVersion)
  )
    return false;
  if (value.action === "rename") return typeof value.name === "string";
  if (value.action === "visibility") return isVisibility(value.visibility);
  return value.action === "archive" || value.action === "unarchive";
}

export function isManagementSnapshot(value: unknown): value is RepositoryManagementSnapshot {
  return (
    isRecord(value) &&
    isRecord(value.repository) &&
    typeof value.repository.id === "string" &&
    typeof value.repository.actorUserId === "string" &&
    typeof value.repository.ownerAccountId === "string" &&
    (value.repository.ownerKind === "USER" || value.repository.ownerKind === "ORGANIZATION") &&
    typeof value.repository.ownerLogin === "string" &&
    typeof value.repository.name === "string" &&
    isVisibility(value.repository.visibility) &&
    typeof value.repository.archived === "boolean" &&
    Number.isSafeInteger(value.repository.version) &&
    Array.isArray(value.repository.actorPermissions) &&
    value.repository.actorPermissions.every(
      (permission) =>
        permission === "read" ||
        permission === "triage" ||
        permission === "triage_plus" ||
        permission === "write" ||
        permission === "maintain" ||
        permission === "admin",
    ) &&
    (value.repository.internalEnterpriseId === null ||
      typeof value.repository.internalEnterpriseId === "string")
  );
}
