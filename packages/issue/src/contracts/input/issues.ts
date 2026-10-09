import type { IssueAction, IssueClosedStateReason } from "../../domain.js";

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
