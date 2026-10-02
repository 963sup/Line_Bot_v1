import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import type { RepositorySummary } from "@line_bot_v1/repository/domain";
import type { Discussion, DiscussionComment, DiscussionSummary } from "../../domain.js";

export type DiscussionIdentity = { userId: string };
export type DiscussionCursor = { at: number; id: string };

export type DiscussionsResult = {
  repository: RepositorySummary;
  discussions: DiscussionSummary[];
  next: string | null;
};

export type DiscussionResult = {
  repository: RepositorySummary;
  discussion: Discussion;
  comments: DiscussionComment[];
  next: string | null;
};

export interface DiscussionReadStore {
  list(
    identity: DiscussionIdentity,
    selector: RepositorySelector,
    after?: DiscussionCursor,
  ): Promise<DiscussionsResult>;
  detail(
    identity: DiscussionIdentity,
    selector: RepositorySelector,
    discussionId: string,
    commentsAfter?: DiscussionCursor,
  ): Promise<DiscussionResult>;
  detailByNumber(
    identity: DiscussionIdentity,
    selector: RepositorySelector,
    discussionNumber: number,
    commentsAfter?: DiscussionCursor,
  ): Promise<DiscussionResult>;
}

export type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
