import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import type { RepositorySummary } from "@line_bot_v1/repository/domain";
import type { Issue, IssueWorkflowStatus } from "../../domain.js";
import type { IssueCommand } from "../input/issues.js";

export type IssueIdentity = { userId: string };

type IssueEvent = {
  actor: string;
  action: string;
  note: string;
  data: Readonly<Record<string, unknown>>;
  version: number;
  at: number;
};

export type IssueSnapshot = {
  userId: string;
  repositories: RepositorySummary[];
  participants: { userId: string; name: string }[];
  issues: Issue[];
  events: (IssueEvent & { issueId: string })[];
  next?: string | null;
};

export interface IssueRepository {
  snapshot(
    identity: IssueIdentity,
    selector?: RepositorySelector,
    list?: boolean,
    view?: "mine" | "created",
    page?: { after?: { at: number; id: string }; workflowStatus?: IssueWorkflowStatus },
  ): Promise<IssueSnapshot>;
  detail(
    identity: IssueIdentity,
    issueNumber: number,
    selector: RepositorySelector,
  ): Promise<IssueSnapshot>;
  execute(identity: IssueIdentity, command: IssueCommand, now: number): Promise<Issue>;
}
