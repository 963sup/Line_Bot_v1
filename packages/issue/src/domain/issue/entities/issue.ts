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
