import type { SqlRow } from "@line_bot_v1/platform/postgres";
import { isRecord, literalValue, stringArray, stringValue } from "@line_bot_v1/platform/validation";
import type { RepositoryVisibility } from "../domain/repository/entities/repository.js";
import {
  type RepositoryPermission,
  repositoryPermissions,
} from "../domain/repository/value-objects/repository-capability.js";

type RepositoryOwnerKind = "USER" | "ORGANIZATION";

export function repositoryOwnerKind(value: unknown): RepositoryOwnerKind {
  return literalValue(value, ["USER", "ORGANIZATION"]);
}

export function repositoryVisibility(value: unknown): RepositoryVisibility {
  return literalValue(value, ["private", "internal", "public"]);
}

export function repositoryPermission(value: unknown): RepositoryPermission {
  return literalValue(value, repositoryPermissions);
}

export function repositoryPermissionArray(value: unknown): RepositoryPermission[] {
  return stringArray(value).map(repositoryPermission);
}

export function decodeIdRow(row: SqlRow): { id: string } {
  return { id: stringValue(row.id) };
}

export function decodePermissionsRow(row: SqlRow): { permissions: RepositoryPermission[] } {
  return { permissions: repositoryPermissionArray(row.permissions) };
}

export function decodeCommandRow(row: SqlRow): { fingerprint: string; result: unknown } {
  return { fingerprint: stringValue(row.fingerprint), result: row.result };
}

export function postgresErrorCode(error: unknown): string | null {
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

export function postgresErrorConstraint(error: unknown): string | null {
  return isRecord(error) && typeof error.constraint === "string" ? error.constraint : null;
}
