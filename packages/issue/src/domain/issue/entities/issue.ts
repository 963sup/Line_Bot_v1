export type IssueState = "OPEN" | "CLOSED";
export type IssueStateReason = "COMPLETED" | "DUPLICATE" | "NOT_PLANNED" | "REOPENED";
export type IssueClosedStateReason = Exclude<IssueStateReason, "REOPENED">;
export type IssueWorkflowStatus = "pending" | "active" | "review" | "completed";
export type IssueAction = "accept" | "report" | "reject" | "approve";

export type Issue = {
  id: string;
  repositoryId: string;
  number: number;
  publisher: string;
  assignees: readonly string[];
  title: string;
  body: string;
  criteria: string;
  state: IssueState;
  stateReason: IssueStateReason | null;
  workflowStatus: IssueWorkflowStatus;
  version: number;
  createdAt: number;
  updatedAt: number;
};
