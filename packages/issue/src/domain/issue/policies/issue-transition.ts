import type { Issue, IssueAction, IssueWorkflowStatus } from "../entities/issue.js";
import { IssueError } from "../errors/issue-error.js";
import { issueText } from "../value-objects/issue-text.js";

export function transitionIssue(
  issue: Issue,
  actor: string,
  action: IssueAction,
  note: string,
): IssueWorkflowStatus {
  if (issue.state !== "OPEN") {
    throw new IssueError(409, "Issue 已關閉；請先重新開啟再操作本地工作流程。");
  }

  const assigneeAction = action === "accept" || action === "report";
  const authorized = assigneeAction
    ? issue.assignees.includes(actor)
    : actor === issue.publisher;
  if (!authorized) {
    throw new IssueError(403, "沒有此 Issue 的本地工作流程操作權限。");
  }

  const expected: Record<IssueAction, IssueWorkflowStatus> = {
    accept: "pending",
    report: "active",
    reject: "review",
    approve: "review",
  };
  if (issue.workflowStatus !== expected[action]) {
    throw new IssueError(409, "Issue 工作流程狀態已變更，請重新讀取。");
  }
  if (action === "report" || action === "reject") issueText(note, 1000);

  return {
    accept: "active",
    report: "review",
    reject: "active",
    approve: "completed",
  }[action] as IssueWorkflowStatus;
}
