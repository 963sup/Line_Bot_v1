import { isRecord } from "@line_bot_v1/platform/validation";
import type { RepositorySubscriptionCommand } from "../../contracts/input/repository-subscription.js";
import { RepositoryError } from "../../contracts/repository.js";
import { isRepositorySubscriptionState } from "../../domain/repository/entities/repository.js";

const requestIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const identifierPattern = /^[\w-]{1,128}$/;

export function parseRepositorySubscriptionCommand(raw: unknown): RepositorySubscriptionCommand {
  if (!isRecord(raw)) {
    throw new RepositoryError(400, "Repository subscription 操作格式不正確。");
  }
  const value = raw;
  const allowed = ["action", "requestId", "repositoryId", "expectedVersion", "state"];
  if (
    value.action !== "set" ||
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    typeof value.requestId !== "string" ||
    !requestIdPattern.test(value.requestId) ||
    typeof value.repositoryId !== "string" ||
    !identifierPattern.test(value.repositoryId) ||
    typeof value.expectedVersion !== "number" ||
    !Number.isSafeInteger(value.expectedVersion) ||
    value.expectedVersion < 0 ||
    !isRepositorySubscriptionState(value.state)
  ) {
    throw new RepositoryError(400, "Repository subscription 操作不正確。");
  }
  return {
    action: "set",
    requestId: value.requestId.toLowerCase(),
    repositoryId: value.repositoryId,
    expectedVersion: value.expectedVersion,
    state: value.state,
  };
}
