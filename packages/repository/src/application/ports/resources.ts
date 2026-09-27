import type { RepositorySummary } from "../../domain.js";
import type { RepositorySelector } from "./selectors.js";

export type RepositoryResourceIdentity = { userId: string };

export type RepositoryResourceCursor = { at: number; id: string };
export type RepositoryLabelCursor = { name: string; id: string };
export type RepositoryMilestoneCursor = { number: number; id: string };

type RepositoryDiscussionSummary = {
  id: string;
  repositoryId: string;
  author: string;
  title: string;
  category: string;
  version: number;
  createdAt: number;
  updatedAt: number;
};

export type RepositoryDiscussion = RepositoryDiscussionSummary & { body: string };

export type RepositoryDiscussionComment = {
  id: string;
  discussionId: string;
  author: string;
  body: string;
  version: number;
  createdAt: number;
};

export type RepositoryLabel = {
  id: string;
  repositoryId: string;
  name: string;
  color: string;
  description: string;
  version: number;
};

export type RepositoryMilestoneStatus = "open" | "closed";

export type RepositoryMilestone = {
  id: string;
  repositoryId: string;
  number: number;
  title: string;
  description: string;
  status: RepositoryMilestoneStatus;
  dueAt: number | null;
  version: number;
  createdAt: number;
  updatedAt: number;
};

export type RepositoryDiscussionsResult = {
  repository: RepositorySummary;
  discussions: RepositoryDiscussionSummary[];
  next: string | null;
};

export type RepositoryDiscussionResult = {
  repository: RepositorySummary;
  discussion: RepositoryDiscussion;
  comments: RepositoryDiscussionComment[];
  next: string | null;
};

export type RepositoryLabelsResult = {
  repository: RepositorySummary;
  labels: RepositoryLabel[];
  next: string | null;
};

export type RepositoryMilestonesResult = {
  repository: RepositorySummary;
  milestones: RepositoryMilestone[];
  next: string | null;
};

export type RepositoryMilestoneResult = {
  repository: RepositorySummary;
  milestone: RepositoryMilestone;
};

export interface RepositoryResourceStore {
  discussions(
    identity: RepositoryResourceIdentity,
    selector: RepositorySelector,
    after?: RepositoryResourceCursor,
  ): Promise<RepositoryDiscussionsResult>;
  discussion(
    identity: RepositoryResourceIdentity,
    selector: RepositorySelector,
    discussionId: string,
    commentsAfter?: RepositoryResourceCursor,
  ): Promise<RepositoryDiscussionResult>;
  labels(
    identity: RepositoryResourceIdentity,
    selector: RepositorySelector,
    after?: RepositoryLabelCursor,
  ): Promise<RepositoryLabelsResult>;
  milestones(
    identity: RepositoryResourceIdentity,
    selector: RepositorySelector,
    status?: RepositoryMilestoneStatus,
    after?: RepositoryMilestoneCursor,
  ): Promise<RepositoryMilestonesResult>;
  milestone(
    identity: RepositoryResourceIdentity,
    selector: RepositorySelector,
    number: number,
  ): Promise<RepositoryMilestoneResult>;
}
