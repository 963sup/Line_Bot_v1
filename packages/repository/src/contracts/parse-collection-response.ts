import { isRecord } from "@line_bot_v1/platform/validation";
import type { RepositorySummary } from "../domain/repository/entities/repository.js";
import type { RepositoryStarListDiscovery, TrendingRepository } from "./discovery.js";
import type {
  RepositoryCreationResult,
  RepositoryOwnerOption,
} from "./input/repository-creation.js";
import type {
  RepositoryStarListDetail,
  RepositoryStarListMutationResult,
  RepositoryStarListSummary,
} from "./repositories/star-lists.js";
import type { StarredRepository } from "./repositories/stars.js";

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
