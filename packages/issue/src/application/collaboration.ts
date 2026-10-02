import type {
  IssueCollaborationCommand,
  IssueCollaborationStore,
  IssueLockReason,
} from "../contracts/collaboration.js";
import { IssueError } from "../domain.js";

const requestIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const lockReasons: readonly IssueLockReason[] = ["OFF_TOPIC", "RESOLVED", "SPAM", "TOO_HEATED"];

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IssueError(400, "Issue collaboration 操作格式不正確。");
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new IssueError(400, "Issue collaboration 操作含有未知欄位。");
  }
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > 120) {
    throw new IssueError(400, `${label} 不正確。`);
  }
  return value;
}

function positiveVersion(value: unknown, label = "Issue"): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new IssueError(400, `${label} 版本不正確。`);
  }
  return Number(value);
}

function commentBody(value: unknown): string {
  if (typeof value !== "string") throw new IssueError(400, "留言內容格式不正確。");
  const normalized = value.trim();
  if (!normalized || normalized.length > 10_000) {
    throw new IssueError(400, "留言內容需為 1 到 10000 字。");
  }
  return normalized;
}

function identifierList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.length) {
    throw new IssueError(400, `${label} 不可為空。`);
  }
  return [...new Set(value.map((item) => identifier(item, label)))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function commandBase(value: Record<string, unknown>) {
  if (typeof value.requestId !== "string" || !requestIdPattern.test(value.requestId)) {
    throw new IssueError(400, "請求編號不正確。");
  }
  return {
    requestId: value.requestId.toLowerCase(),
    repositoryId: identifier(value.repositoryId, "Repository 識別碼"),
    issueId: identifier(value.issueId, "Issue 識別碼"),
    expectedVersion: positiveVersion(value.expectedVersion),
  };
}

function parseCommand(raw: unknown): IssueCollaborationCommand {
  const value = objectInput(raw);
  const base = commandBase(value);
  const action = value.action;

  if (action === "add-comment") {
    exactKeys(value, ["action", "requestId", "repositoryId", "issueId", "expectedVersion", "body"]);
    return { ...base, action, body: commentBody(value.body) };
  }

  if (action === "edit-comment" || action === "delete-comment") {
    exactKeys(
      value,
      action === "edit-comment"
        ? [
            "action",
            "requestId",
            "repositoryId",
            "issueId",
            "expectedVersion",
            "commentId",
            "commentVersion",
            "body",
          ]
        : [
            "action",
            "requestId",
            "repositoryId",
            "issueId",
            "expectedVersion",
            "commentId",
            "commentVersion",
          ],
    );
    return {
      ...base,
      action,
      commentId: identifier(value.commentId, "留言識別碼"),
      commentVersion: positiveVersion(value.commentVersion, "留言"),
      ...(action === "edit-comment" ? { body: commentBody(value.body) } : {}),
    };
  }

  if (action === "add-labels" || action === "remove-labels") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "issueId",
      "expectedVersion",
      "labelIds",
    ]);
    return { ...base, action, labelIds: identifierList(value.labelIds, "Label 識別碼") };
  }

  if (action === "clear-labels") {
    exactKeys(value, ["action", "requestId", "repositoryId", "issueId", "expectedVersion"]);
    return { ...base, action };
  }

  if (action === "set-milestone") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "issueId",
      "expectedVersion",
      "milestoneId",
    ]);
    return {
      ...base,
      action,
      milestoneId:
        value.milestoneId === null ? null : identifier(value.milestoneId, "Milestone 識別碼"),
    };
  }

  if (action === "set-issue-type") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "issueId",
      "expectedVersion",
      "issueTypeId",
    ]);
    return {
      ...base,
      action,
      issueTypeId:
        value.issueTypeId === null ? null : identifier(value.issueTypeId, "IssueType 識別碼"),
    };
  }

  if (
    action === "add-sub-issue" ||
    action === "remove-sub-issue" ||
    action === "add-blocked-by" ||
    action === "remove-blocked-by" ||
    action === "add-related" ||
    action === "remove-related"
  ) {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "issueId",
      "expectedVersion",
      "targetIssueId",
    ]);
    return {
      ...base,
      action,
      targetIssueId: identifier(value.targetIssueId, "目標 Issue 識別碼"),
    };
  }

  if (action === "reprioritize-sub-issue") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "issueId",
      "expectedVersion",
      "targetIssueId",
      "beforeIssueId",
    ]);
    return {
      ...base,
      action,
      targetIssueId: identifier(value.targetIssueId, "Sub-issue 識別碼"),
      beforeIssueId:
        value.beforeIssueId === null
          ? null
          : identifier(value.beforeIssueId, "排序目標 Issue 識別碼"),
    };
  }

  if (action === "lock") {
    exactKeys(value, [
      "action",
      "requestId",
      "repositoryId",
      "issueId",
      "expectedVersion",
      "reason",
    ]);
    if (!lockReasons.includes(value.reason as IssueLockReason)) {
      throw new IssueError(400, "Conversation lock reason 不正確。");
    }
    return { ...base, action, reason: value.reason as IssueLockReason };
  }

  if (action === "unlock") {
    exactKeys(value, ["action", "requestId", "repositoryId", "issueId", "expectedVersion"]);
    return { ...base, action };
  }

  throw new IssueError(400, "Issue collaboration 操作不正確。");
}

export function createIssueCollaboration(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): IssueCollaborationStore;
  now(): number;
}) {
  async function identity(subject: string) {
    return { userId: (await deps.activeUser(subject)).id };
  }

  return {
    view: async (subject: string, repositoryId: string, issueId: string) =>
      deps
        .store()
        .view(
          await identity(subject),
          identifier(repositoryId, "Repository 識別碼"),
          identifier(issueId, "Issue 識別碼"),
        ),
    command: async (subject: string, raw: unknown) =>
      deps.store().execute(await identity(subject), parseCommand(raw), deps.now()),
  };
}
