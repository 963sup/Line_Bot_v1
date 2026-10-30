import { isRecord } from "@line_bot_v1/platform/validation";
import { isRepositorySummary as isRepository } from "@line_bot_v1/repository/contracts/parse-collection-response";
import type { IssueSnapshot } from "./repositories/issues.js";

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isIssue(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.repositoryId === "string" &&
    Number.isSafeInteger(value.number) &&
    typeof value.publisher === "string" &&
    strings(value.assignees) &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    typeof value.criteria === "string" &&
    (value.state === "OPEN" || value.state === "CLOSED") &&
    (value.stateReason === null ||
      value.stateReason === "COMPLETED" ||
      value.stateReason === "DUPLICATE" ||
      value.stateReason === "NOT_PLANNED" ||
      value.stateReason === "REOPENED") &&
    (value.workflowStatus === "pending" ||
      value.workflowStatus === "active" ||
      value.workflowStatus === "review" ||
      value.workflowStatus === "completed") &&
    Number.isSafeInteger(value.version) &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

export function isIssueSnapshot(value: unknown): value is IssueSnapshot {
  return (
    isRecord(value) &&
    typeof value.userId === "string" &&
    Array.isArray(value.repositories) &&
    value.repositories.every(isRepository) &&
    Array.isArray(value.participants) &&
    value.participants.every(
      (item) => isRecord(item) && typeof item.userId === "string" && typeof item.name === "string",
    ) &&
    Array.isArray(value.issues) &&
    value.issues.every(isIssue) &&
    Array.isArray(value.events) &&
    value.events.every(
      (item) =>
        isRecord(item) &&
        typeof item.issueId === "string" &&
        typeof item.actor === "string" &&
        typeof item.action === "string" &&
        typeof item.note === "string" &&
        isRecord(item.data) &&
        Number.isSafeInteger(item.version) &&
        typeof item.at === "number",
    ) &&
    (!("next" in value) || value.next === null || typeof value.next === "string")
  );
}
