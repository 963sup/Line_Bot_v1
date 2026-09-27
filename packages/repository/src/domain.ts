export type RepositoryCapability = "read" | "triage" | "write" | "admin";

export type RepositorySummary = {
  id: string;
  ownerLogin: string;
  name: string;
  capability: RepositoryCapability;
};

export type IssueStatus = "pending" | "active" | "review" | "completed";
export type IssueAction = "accept" | "report" | "reject" | "approve";

export type Issue = {
  id: string;
  repositoryId: string;
  number: number;
  publisher: string;
  assignee: string;
  title: string;
  criteria: string;
  status: IssueStatus;
  version: number;
  createdAt: number;
  updatedAt: number;
};

export function normalizeRepositoryName(value: string): string | null {
  const name = value.trim();
  return name && name.length <= 100 ? name : null;
}

export function normalizeIssueNumber(value: number | string): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 1 ? number : null;
}

export function normalizeDiscussionId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 120 ? value : null;
}

export function normalizeRepositoryMilestoneNumber(value: number | string): number | null {
  if (typeof value === "string" && !/^[1-9]\d*$/.test(value)) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 1 ? number : null;
}

export class RepositoryError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

export class IssueError extends RepositoryError {
  constructor(status: number, message: string) {
    super(status, message);
    this.name = "IssueError";
  }
}

export function issueText(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new IssueError(400, `請填寫 1 至 ${max} 字的內容。`);
  }
  return value.trim();
}

export function transitionIssue(
  issue: Issue,
  actor: string,
  action: IssueAction,
  note: string,
): IssueStatus {
  const assigneeAction = action === "accept" || action === "report";
  if (actor !== (assigneeAction ? issue.assignee : issue.publisher)) {
    throw new IssueError(403, "沒有此 Issue 的操作權限。");
  }
  const expected: Record<IssueAction, IssueStatus> = {
    accept: "pending",
    report: "active",
    reject: "review",
    approve: "review",
  };
  if (issue.status !== expected[action]) {
    throw new IssueError(409, "Issue 狀態已變更，請重新讀取。");
  }
  if (action === "report" || action === "reject") issueText(note, 1000);
  return {
    accept: "active",
    report: "review",
    reject: "active",
    approve: "completed",
  }[action] as IssueStatus;
}
