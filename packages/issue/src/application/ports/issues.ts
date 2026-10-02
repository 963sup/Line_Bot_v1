import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import type { RepositorySummary } from "@line_bot_v1/repository/domain";
import type {
  Issue,
  IssueAction,
  IssueClosedStateReason,
  IssueWorkflowStatus,
} from "../../domain.js";

export type IssueIdentity = { userId: string };

export type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";

type IssueCommandBase = Readonly<{
  requestId: string;
  repositoryId: string;
}>;

type ExistingIssueCommandBase = IssueCommandBase &
  Readonly<{
    issueId: string;
    expectedVersion: number;
  }>;

export type IssueCommand =
  | (IssueCommandBase & {
      action: "create";
      title: string;
      body: string;
      criteria: string;
      assigneeIds: readonly string[];
    })
  | (ExistingIssueCommandBase & {
      action: IssueAction;
      note: string;
    })
  | (ExistingIssueCommandBase & {
      action: "edit";
      title?: string;
      body?: string;
      criteria?: string;
    })
  | (ExistingIssueCommandBase & {
      action: "close";
      stateReason: IssueClosedStateReason | null;
      note: string;
    })
  | (ExistingIssueCommandBase & {
      action: "reopen";
      note: string;
    })
  | (ExistingIssueCommandBase & {
      action: "add-assignees" | "remove-assignees";
      assigneeIds: readonly string[];
    });

type IssueEvent = {
  actor: string;
  action: string;
  note: string;
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

export interface IssueStore {
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
