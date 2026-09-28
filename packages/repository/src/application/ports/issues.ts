import type { Issue, IssueAction, RepositorySummary } from "../../domain.js";
import type { RepositorySelector } from "./selectors.js";

export type IssueIdentity = { userId: string };

export type { RepositorySelector } from "./selectors.js";

export type IssueCommand = { requestId: string; repositoryId: string } & (
  | { action: "create"; title: string; criteria: string; assignee: string }
  | { action: IssueAction; issueId: string; expectedVersion: number; note: string }
);

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
    page?: { after?: { at: number; id: string }; status?: string },
  ): Promise<IssueSnapshot>;
  detail(
    identity: IssueIdentity,
    issueNumber: number,
    selector: RepositorySelector,
  ): Promise<IssueSnapshot>;
  execute(identity: IssueIdentity, command: IssueCommand, now: number): Promise<Issue>;
}
