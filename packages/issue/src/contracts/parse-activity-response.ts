import { isRecord } from "@line_bot_v1/platform/validation";
import type { IssueActivityItem } from "./activity.js";

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
