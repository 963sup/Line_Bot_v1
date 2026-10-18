import { isRecord } from "@line_bot_v1/platform/validation";
import type { RepositoryPermission, RepositoryVisibility } from "@line_bot_v1/repository/domain";
import { repositoryPermissions } from "@line_bot_v1/repository/domain";

type LegacyWbsEntryStatus = "available" | "none" | "unavailable";

export type RepositoryOverview = Readonly<{
  repository: Readonly<{
    id: string;
    ownerLogin: string;
    name: string;
    visibility: RepositoryVisibility;
    archived: boolean;
    permissions: readonly RepositoryPermission[];
  }>;
  legacyWbs: Readonly<{ status: LegacyWbsEntryStatus }>;
}>;

function isVisibility(value: unknown): value is RepositoryVisibility {
  return value === "private" || value === "internal" || value === "public";
}

function isPermission(value: unknown): value is RepositoryPermission {
  return repositoryPermissions.some((permission) => permission === value);
}

function isLegacyStatus(value: unknown): value is LegacyWbsEntryStatus {
  return value === "available" || value === "none" || value === "unavailable";
}

export function parseRepositoryOverview(value: unknown): RepositoryOverview {
  if (
    !isRecord(value) ||
    !isRecord(value.repository) ||
    typeof value.repository.id !== "string" ||
    typeof value.repository.ownerLogin !== "string" ||
    typeof value.repository.name !== "string" ||
    !isVisibility(value.repository.visibility) ||
    typeof value.repository.archived !== "boolean" ||
    !Array.isArray(value.repository.permissions) ||
    !value.repository.permissions.every(isPermission) ||
    !isRecord(value.legacyWbs) ||
    !isLegacyStatus(value.legacyWbs.status)
  ) {
    throw new Error("Repository Overview 回應格式不正確。");
  }
  return {
    repository: {
      id: value.repository.id,
      ownerLogin: value.repository.ownerLogin,
      name: value.repository.name,
      visibility: value.repository.visibility,
      archived: value.repository.archived,
      permissions: value.repository.permissions,
    },
    legacyWbs: { status: value.legacyWbs.status },
  };
}
