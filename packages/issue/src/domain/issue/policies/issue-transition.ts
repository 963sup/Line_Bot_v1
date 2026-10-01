import type { Issue, IssueAction, IssueStatus } from "../entities/issue.js";
import { IssueError } from "../errors/issue-error.js";
import { issueText } from "../value-objects/issue-text.js";

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
