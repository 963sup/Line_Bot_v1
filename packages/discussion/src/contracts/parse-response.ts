import { isRecord } from "@line_bot_v1/platform/validation";
import { isRepositorySummary as isRepository } from "@line_bot_v1/repository/contracts/parse-collection-response";
import type { DiscussionResult, DiscussionsResult } from "./output/discussion-read.js";

function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function isDiscussionSummary(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.repositoryId === "string" &&
    (value.number === null || Number.isSafeInteger(value.number)) &&
    typeof value.author === "string" &&
    typeof value.title === "string" &&
    typeof value.category === "string" &&
    isNullableString(value.categoryId) &&
    (value.state === "OPEN" || value.state === "CLOSED") &&
    (value.stateReason === null ||
      value.stateReason === "DUPLICATE" ||
      value.stateReason === "OUTDATED" ||
      value.stateReason === "REOPENED" ||
      value.stateReason === "RESOLVED") &&
    typeof value.locked === "boolean" &&
    (value.lockReason === null ||
      value.lockReason === "OFF_TOPIC" ||
      value.lockReason === "RESOLVED" ||
      value.lockReason === "SPAM" ||
      value.lockReason === "TOO_HEATED") &&
    typeof value.deleted === "boolean" &&
    Number.isSafeInteger(value.version) &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

function isDiscussion(value: unknown) {
  return isDiscussionSummary(value) && "body" in value && isNullableString(value.body);
}

function isDiscussionComment(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.discussionId === "string" &&
    typeof value.author === "string" &&
    isNullableString(value.body) &&
    isNullableString(value.replyToId) &&
    typeof value.deleted === "boolean" &&
    Number.isSafeInteger(value.version) &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

export function isDiscussionsResult(value: unknown): value is DiscussionsResult {
  return (
    isRecord(value) &&
    isRepository(value.repository) &&
    Array.isArray(value.discussions) &&
    value.discussions.every(isDiscussionSummary) &&
    hasNext(value)
  );
}

export function isDiscussionResult(value: unknown): value is DiscussionResult {
  return (
    isRecord(value) &&
    isRepository(value.repository) &&
    isDiscussion(value.discussion) &&
    Array.isArray(value.comments) &&
    value.comments.every(isDiscussionComment) &&
    hasNext(value)
  );
}

function hasNext(value: Record<string, unknown>) {
  return value.next === null || typeof value.next === "string";
}
