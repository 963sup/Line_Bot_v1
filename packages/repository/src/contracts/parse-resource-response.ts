import { isRecord } from "@line_bot_v1/platform/validation";
import type {
  RepositoryLabelsResult,
  RepositoryMilestoneResult,
  RepositoryMilestonesResult,
} from "./output/resources.js";
import { isRepositorySummary as isRepository } from "./parse-collection-response.js";

function isLabel(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.repositoryId === "string" &&
    typeof value.name === "string" &&
    typeof value.color === "string" &&
    typeof value.description === "string" &&
    Number.isSafeInteger(value.version)
  );
}

function isMilestone(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.repositoryId === "string" &&
    Number.isSafeInteger(value.number) &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    (value.status === "open" || value.status === "closed") &&
    (value.dueAt === null || typeof value.dueAt === "number") &&
    Number.isSafeInteger(value.version) &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

export function isLabelsResult(value: unknown): value is RepositoryLabelsResult {
  return (
    isRecord(value) &&
    isRepository(value.repository) &&
    Array.isArray(value.labels) &&
    value.labels.every(isLabel) &&
    hasNext(value)
  );
}

export function isMilestonesResult(value: unknown): value is RepositoryMilestonesResult {
  return (
    isRecord(value) &&
    isRepository(value.repository) &&
    Array.isArray(value.milestones) &&
    value.milestones.every(isMilestone) &&
    hasNext(value)
  );
}

export function isMilestoneResult(value: unknown): value is RepositoryMilestoneResult {
  return isRecord(value) && isRepository(value.repository) && isMilestone(value.milestone);
}

function hasNext(value: Record<string, unknown>) {
  return value.next === null || typeof value.next === "string";
}
