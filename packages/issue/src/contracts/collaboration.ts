import type { IssueTypeDefinition } from "./issue-types.js";

export type IssueLockReason = "OFF_TOPIC" | "RESOLVED" | "SPAM" | "TOO_HEATED";

type CommandBase = Readonly<{
  requestId: string;
  repositoryId: string;
  issueId: string;
  expectedVersion: number;
}>;

export type IssueCollaborationCommand =
  | (CommandBase & Readonly<{ action: "add-comment"; body: string }>)
  | (CommandBase &
      Readonly<{
        action: "edit-comment" | "delete-comment";
        commentId: string;
        commentVersion: number;
        body?: string;
      }>)
  | (CommandBase &
      Readonly<{ action: "add-labels" | "remove-labels"; labelIds: readonly string[] }>)
  | (CommandBase & Readonly<{ action: "clear-labels" }>)
  | (CommandBase & Readonly<{ action: "set-milestone"; milestoneId: string | null }>)
  | (CommandBase & Readonly<{ action: "set-issue-type"; issueTypeId: string | null }>)
  | (CommandBase &
      Readonly<{
        action: "add-sub-issue" | "remove-sub-issue" | "add-blocked-by" | "remove-blocked-by";
        targetIssueId: string;
      }>)
  | (CommandBase &
      Readonly<{
        action: "add-related" | "remove-related";
        targetIssueId: string;
        targetExpectedVersion: number;
      }>)
  | (CommandBase &
      Readonly<{
        action: "reprioritize-sub-issue";
        targetIssueId: string;
        beforeIssueId: string | null;
      }>)
  | (CommandBase & Readonly<{ action: "lock"; reason: IssueLockReason }>)
  | (CommandBase & Readonly<{ action: "unlock" }>);

export type IssueCommentView = Readonly<{
  id: string;
  issueId: string;
  author: string;
  body: string | null;
  deleted: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
}>;

export type IssueCollaborationView = Readonly<{
  issueId: string;
  repositoryId: string;
  version: number;
  locked: boolean;
  lockReason: IssueLockReason | null;
  milestoneId: string | null;
  issueType: IssueTypeDefinition | null;
  labelIds: readonly string[];
  comments: readonly IssueCommentView[];
  parentIssueId: string | null;
  subIssueIds: readonly string[];
  blockedByIssueIds: readonly string[];
  blockingIssueIds: readonly string[];
  relatedIssueIds: readonly string[];
}>;

export type IssueCollaborationReceipt = Readonly<{
  requestId: string;
  repositoryId: string;
  issueId: string;
  action: IssueCollaborationCommand["action"];
  version: number;
  at: number;
  resourceId: string | null;
  data: Readonly<Record<string, unknown>>;
}>;

export type IssueCollaborationIdentity = Readonly<{ userId: string }>;

export interface IssueCollaborationStore {
  view(
    identity: IssueCollaborationIdentity,
    repositoryId: string,
    issueId: string,
  ): Promise<IssueCollaborationView>;
  execute(
    identity: IssueCollaborationIdentity,
    command: IssueCollaborationCommand,
    now: number,
  ): Promise<IssueCollaborationReceipt>;
}
