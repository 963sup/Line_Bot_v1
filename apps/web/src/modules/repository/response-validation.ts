import type { IssueActivityItem } from "@line_bot_v1/issue/contracts/activity";
import type {
  RepositoryStarListDiscovery,
  TrendingRepository,
} from "@line_bot_v1/repository/contracts/discovery";
import type {
  RepositoryCreationResult,
  RepositoryOwnerOption,
} from "@line_bot_v1/repository/contracts/input/repository-creation";
import type {
  RepositoryStarListDetail,
  RepositoryStarListMutationResult,
  RepositoryStarListSummary,
} from "@line_bot_v1/repository/contracts/repositories/star-lists";
import type { StarredRepository } from "@line_bot_v1/repository/contracts/repositories/stars";
import type { RepositorySummary } from "@line_bot_v1/repository/domain/repository/entities/repository";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function errorMessage(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === "string" ? value.error : fallback;
}

const permissions = new Set(["read", "triage", "triage_plus", "write", "maintain", "admin"]);
const visibilities = new Set(["private", "internal", "public"]);

export function isRepositorySummary(value: unknown): value is RepositorySummary {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ownerLogin === "string" &&
    typeof value.name === "string" &&
    Array.isArray(value.permissions) &&
    value.permissions.every(
      (permission) => typeof permission === "string" && permissions.has(permission),
    )
  );
}

export function isStarredRepository(value: unknown): value is StarredRepository {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ownerLogin === "string" &&
    typeof value.name === "string" &&
    typeof value.visibility === "string" &&
    typeof value.starredAt === "number" &&
    Number.isSafeInteger(value.starCount)
  );
}

export function isTrendingRepository(value: unknown): value is TrendingRepository {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ownerLogin === "string" &&
    typeof value.name === "string" &&
    Array.isArray(value.permissions) &&
    value.permissions.every(
      (permission) => typeof permission === "string" && permissions.has(permission),
    ) &&
    typeof value.visibility === "string" &&
    Number.isSafeInteger(value.recentStarCount) &&
    Number.isSafeInteger(value.starCount) &&
    typeof value.starred === "boolean"
  );
}

export function isIssueActivity(value: unknown): value is IssueActivityItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.occurredAt === "number" &&
    typeof value.actorLogin === "string" &&
    typeof value.action === "string" &&
    isRecord(value.repository) &&
    typeof value.repository.id === "string" &&
    typeof value.repository.ownerLogin === "string" &&
    typeof value.repository.name === "string" &&
    isRecord(value.issue) &&
    Number.isSafeInteger(value.issue.number) &&
    typeof value.issue.title === "string"
  );
}

function isStarListRepository(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ownerLogin === "string" &&
    typeof value.name === "string" &&
    typeof value.visibility === "string"
  );
}

function isRepositoryIdentity(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ownerLogin === "string" &&
    typeof value.name === "string"
  );
}

export function isStarListSummary(value: unknown): value is RepositoryStarListSummary {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ownerLogin === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    (value.visibility === "private" || value.visibility === "public") &&
    Number.isSafeInteger(value.version) &&
    Number.isSafeInteger(value.visibleRepositoryCount) &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

export function isStarListDetail(value: unknown): value is RepositoryStarListDetail {
  return (
    isStarListSummary(value) &&
    "editable" in value &&
    typeof value.editable === "boolean" &&
    "repositories" in value &&
    Array.isArray(value.repositories) &&
    value.repositories.every(isStarListRepository)
  );
}

export function isStarListDiscovery(value: unknown): value is RepositoryStarListDiscovery {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ownerLogin === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    Number.isSafeInteger(value.visibleRepositoryCount) &&
    typeof value.updatedAt === "number" &&
    Array.isArray(value.repositories) &&
    value.repositories.every(isRepositoryIdentity)
  );
}

export function isOwnerOption(value: unknown): value is RepositoryOwnerOption {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.kind === "USER" || value.kind === "ORGANIZATION") &&
    typeof value.login === "string" &&
    typeof value.internalEligible === "boolean" &&
    Array.isArray(value.creatableVisibilities) &&
    value.creatableVisibilities.every(
      (visibility) => typeof visibility === "string" && visibilities.has(visibility),
    )
  );
}

export function isCreationResult(value: unknown): value is RepositoryCreationResult {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ownerAccountId === "string" &&
    (value.ownerKind === "USER" || value.ownerKind === "ORGANIZATION") &&
    typeof value.ownerLogin === "string" &&
    typeof value.name === "string" &&
    typeof value.visibility === "string" &&
    visibilities.has(value.visibility) &&
    Number.isSafeInteger(value.version)
  );
}

export function isStarListMutation(value: unknown): value is RepositoryStarListMutationResult {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    Number.isSafeInteger(value.version) &&
    (value.visibility === "private" || value.visibility === "public") &&
    typeof value.deleted === "boolean"
  );
}
