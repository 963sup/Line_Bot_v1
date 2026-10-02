import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { normalizeRepositoryName } from "@line_bot_v1/repository/domain";
import {
  type IssueAction,
  type IssueClosedStateReason,
  IssueError,
  type IssueWorkflowStatus,
  issueText,
  normalizeIssueNumber,
} from "../domain.js";
import type { IssueCommand, IssueStore, RepositorySelector } from "./ports/issues.js";

const requestIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const workflowActions: readonly IssueAction[] = ["accept", "report", "reject", "approve"];
const workflowStatuses: readonly IssueWorkflowStatus[] = [
  "pending",
  "active",
  "review",
  "completed",
];
const closedReasons: readonly IssueClosedStateReason[] = ["COMPLETED", "DUPLICATE", "NOT_PLANNED"];

function accountLoginForRepositoryLocator(value: string): string | null {
  try {
    return normalizeAccountLogin(value);
  } catch {
    return null;
  }
}

function optionalText(value: unknown, max: number, label: string): string {
  if (typeof value !== "string") {
    throw new IssueError(400, `${label} 格式不正確。`);
  }
  const normalized = value.trim();
  if (normalized.length > max) {
    throw new IssueError(400, `${label} 最多 ${max} 字。`);
  }
  return normalized;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > 120) {
    throw new IssueError(400, `${label} 不正確。`);
  }
  return value;
}

function identifierList(value: unknown, label: string, required = false): string[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value)) throw new IssueError(400, `${label} 格式不正確。`);
  const normalized = value.map((item) => identifier(item, label));
  const unique = [...new Set(normalized)].sort((left, right) => left.localeCompare(right));
  if (required && !unique.length) throw new IssueError(400, `${label} 不可為空。`);
  return unique;
}

function commandBase(value: Record<string, unknown>) {
  if (
    typeof value.requestId !== "string" ||
    !requestIdPattern.test(value.requestId) ||
    typeof value.repositoryId !== "string" ||
    !value.repositoryId ||
    value.repositoryId.length > 120
  ) {
    throw new IssueError(400, "請求編號或 Repository 不正確。");
  }
  return {
    requestId: value.requestId,
    repositoryId: value.repositoryId,
  };
}

function existingIssueBase(value: Record<string, unknown>) {
  const base = commandBase(value);
  if (!Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1) {
    throw new IssueError(400, "Issue 版本不正確。");
  }
  return {
    ...base,
    issueId: identifier(value.issueId, "Issue 識別碼"),
    expectedVersion: Number(value.expectedVersion),
  };
}

function parseIssueCommand(value: Record<string, unknown>): IssueCommand {
  const action = value.action;
  if (action === "create") {
    const base = commandBase(value);
    const assigneeIds =
      value.assigneeIds === undefined && value.assignee !== undefined
        ? [identifier(value.assignee, "Issue assignee")]
        : identifierList(value.assigneeIds, "Issue assignees");
    return {
      ...base,
      action,
      title: issueText(value.title, 80),
      body: optionalText(value.body ?? "", 10000, "Issue body"),
      criteria: optionalText(value.criteria ?? "", 1000, "Issue acceptance criteria"),
      assigneeIds,
    };
  }

  const base = existingIssueBase(value);
  if (workflowActions.includes(action as IssueAction)) {
    return {
      ...base,
      action: action as IssueAction,
      note:
        action === "report" || action === "reject"
          ? issueText(value.note, 1000)
          : optionalText(value.note ?? "", 1000, "Issue note"),
    };
  }

  if (action === "edit") {
    const update: { title?: string; body?: string; criteria?: string } = {};
    if (value.title !== undefined) update.title = issueText(value.title, 80);
    if (value.body !== undefined) update.body = optionalText(value.body, 10000, "Issue body");
    if (value.criteria !== undefined) {
      update.criteria = optionalText(value.criteria, 1000, "Issue acceptance criteria");
    }
    if (update.title === undefined && update.body === undefined && update.criteria === undefined) {
      throw new IssueError(400, "Issue 內容沒有可更新欄位。");
    }
    return { ...base, action, ...update };
  }

  if (action === "close") {
    let stateReason: IssueClosedStateReason | null = null;
    if (value.stateReason !== undefined && value.stateReason !== null) {
      if (!closedReasons.includes(value.stateReason as IssueClosedStateReason)) {
        throw new IssueError(400, "Issue close stateReason 不正確。");
      }
      stateReason = value.stateReason as IssueClosedStateReason;
    }
    return {
      ...base,
      action,
      stateReason,
      note: optionalText(value.note ?? "", 1000, "Issue note"),
    };
  }

  if (action === "reopen") {
    return {
      ...base,
      action,
      note: optionalText(value.note ?? "", 1000, "Issue note"),
    };
  }

  if (action === "add-assignees" || action === "remove-assignees") {
    return {
      ...base,
      action,
      assigneeIds: identifierList(value.assigneeIds, "Issue assignees", true),
    };
  }

  throw new IssueError(400, "Issue 操作不正確。");
}

function selector(value?: RepositorySelector): RepositorySelector | undefined {
  if (!value) return undefined;
  if ("repositoryId" in value) {
    if (!value.repositoryId || value.repositoryId.length > 120) {
      throw new IssueError(400, "Repository 識別碼不正確。");
    }
    return value;
  }
  const ownerLogin = accountLoginForRepositoryLocator(value.ownerLogin);
  const repositoryName = normalizeRepositoryName(value.repositoryName);
  if (!ownerLogin || !repositoryName) {
    throw new IssueError(400, "Repository 路徑不正確。");
  }
  return {
    ownerLogin,
    repositoryName,
    ...(value.followRenames === false ? { followRenames: false } : {}),
  };
}

export function createIssues(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): IssueStore;
  now(): number;
}) {
  async function identity(subject: string) {
    return { userId: (await deps.activeUser(subject)).id };
  }
  return {
    get: async (
      subject: string,
      repository?: RepositorySelector,
      list = false,
      view?: "mine" | "created",
      after?: string,
      workflowStatus?: string,
    ) => {
      const actor = await identity(subject);
      const selected = selector(repository);
      if (workflowStatus && !workflowStatuses.includes(workflowStatus as IssueWorkflowStatus)) {
        throw new IssueError(400, "Issue 工作流程狀態不正確。");
      }
      let cursor: { at: number; id: string } | undefined;
      if (after !== undefined) {
        try {
          if (!list || after.length > 240) throw new Error();
          const value = JSON.parse(after) as Record<string, unknown>;
          if (
            !Number.isSafeInteger(value.at) ||
            Number(value.at) < 0 ||
            typeof value.id !== "string" ||
            !value.id
          ) {
            throw new Error();
          }
          cursor = { at: Number(value.at), id: value.id };
        } catch {
          throw new IssueError(400, "Issue 分頁不正確，請重新讀取。");
        }
      }
      return deps.store().snapshot(actor, selected, list, view, {
        after: cursor,
        workflowStatus: workflowStatus as IssueWorkflowStatus | undefined,
      });
    },
    detail: async (subject: string, issueNumber: number, repository: RepositorySelector) => {
      const selectedIssueNumber = normalizeIssueNumber(issueNumber);
      if (selectedIssueNumber === null) throw new IssueError(400, "Issue number 不正確。");
      const selected = selector(repository);
      if (!selected) throw new IssueError(400, "Repository 路徑不正確。");
      return deps.store().detail(await identity(subject), selectedIssueNumber, selected);
    },
    command: async (subject: string, input: Record<string, unknown>) =>
      deps.store().execute(await identity(subject), parseIssueCommand(input), deps.now()),
  };
}
