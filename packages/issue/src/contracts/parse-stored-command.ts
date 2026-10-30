import type { IssueCommand } from "./input/issues.js";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isIssueCommand(value: unknown): value is IssueCommand {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("requestId" in value) ||
    typeof value.requestId !== "string" ||
    !("repositoryId" in value) ||
    typeof value.repositoryId !== "string" ||
    !("action" in value) ||
    typeof value.action !== "string"
  )
    return false;
  if (value.action === "create") {
    return (
      "title" in value &&
      typeof value.title === "string" &&
      "body" in value &&
      typeof value.body === "string" &&
      "criteria" in value &&
      typeof value.criteria === "string" &&
      "assigneeIds" in value &&
      isStringArray(value.assigneeIds)
    );
  }
  if (
    !("issueId" in value) ||
    typeof value.issueId !== "string" ||
    !("expectedVersion" in value) ||
    !Number.isSafeInteger(value.expectedVersion)
  )
    return false;
  if (value.action === "edit") {
    return (
      (!("title" in value) || typeof value.title === "string") &&
      (!("body" in value) || typeof value.body === "string") &&
      (!("criteria" in value) || typeof value.criteria === "string")
    );
  }
  if (value.action === "add-assignees" || value.action === "remove-assignees") {
    return "assigneeIds" in value && isStringArray(value.assigneeIds);
  }
  if (value.action === "close") {
    return (
      "note" in value &&
      typeof value.note === "string" &&
      "stateReason" in value &&
      (value.stateReason === null ||
        value.stateReason === "COMPLETED" ||
        value.stateReason === "DUPLICATE" ||
        value.stateReason === "NOT_PLANNED")
    );
  }
  return (
    (value.action === "accept" ||
      value.action === "report" ||
      value.action === "reject" ||
      value.action === "approve" ||
      value.action === "reopen") &&
    "note" in value &&
    typeof value.note === "string"
  );
}
