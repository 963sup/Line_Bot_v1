import { IssueError, issueText, normalizeIssueNumber, normalizeRepositoryName } from "../domain.js";
import type { IssueCommand, IssueStore, RepositorySelector } from "./ports/issues.js";

function parseIssueCommand(value: Record<string, unknown>): IssueCommand {
  const { requestId, repositoryId, action } = value;
  if (
    typeof requestId !== "string" ||
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestId) ||
    typeof repositoryId !== "string" ||
    !repositoryId ||
    repositoryId.length > 120
  ) {
    throw new IssueError(400, "請求編號或 Repository 不正確。");
  }
  if (action === "create") {
    return {
      requestId,
      repositoryId,
      action,
      title: issueText(value.title, 80),
      criteria: issueText(value.criteria, 1000),
      assignee: issueText(value.assignee, 120),
    };
  }
  if (
    !["accept", "report", "reject", "approve"].includes(String(action)) ||
    !Number.isSafeInteger(value.expectedVersion) ||
    Number(value.expectedVersion) < 1
  ) {
    throw new IssueError(400, "操作或版本不正確。");
  }
  return {
    requestId,
    repositoryId,
    action: action as "accept" | "report" | "reject" | "approve",
    issueId: issueText(value.issueId, 120),
    expectedVersion: Number(value.expectedVersion),
    note: action === "report" || action === "reject" ? issueText(value.note, 1000) : "",
  };
}

function selector(value?: RepositorySelector): RepositorySelector | undefined {
  if (!value) return undefined;
  if ("repositoryId" in value) {
    if (!value.repositoryId || value.repositoryId.length > 120) {
      throw new IssueError(400, "Repository 識別碼不正確。");
    }
    return value;
  }
  const repositoryName = normalizeRepositoryName(value.repositoryName);
  if (!value.ownerLogin || !repositoryName) {
    throw new IssueError(400, "Repository 路徑不正確。");
  }
  return { ownerLogin: value.ownerLogin, repositoryName };
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
      status?: string,
    ) => {
      const actor = await identity(subject);
      const selected = selector(repository);
      if (status && !["pending", "active", "review", "completed"].includes(status)) {
        throw new IssueError(400, "Issue 狀態不正確。");
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
      return deps.store().snapshot(actor, selected, list, view, { after: cursor, status });
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
