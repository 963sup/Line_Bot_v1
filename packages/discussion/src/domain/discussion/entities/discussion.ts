export type DiscussionState = "OPEN" | "CLOSED";
export type DiscussionStateReason = "DUPLICATE" | "OUTDATED" | "REOPENED" | "RESOLVED";
export type DiscussionCloseReason = Exclude<DiscussionStateReason, "REOPENED">;
export type DiscussionLockReason = "OFF_TOPIC" | "RESOLVED" | "SPAM" | "TOO_HEATED";

export type DiscussionSummary = {
  id: string;
  repositoryId: string;
  number: number | null;
  author: string;
  title: string;
  category: string;
  categoryId: string | null;
  state: DiscussionState;
  stateReason: DiscussionStateReason | null;
  locked: boolean;
  lockReason: DiscussionLockReason | null;
  deleted: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
};

export type Discussion = DiscussionSummary & { body: string | null };

export type DiscussionComment = {
  id: string;
  discussionId: string;
  author: string;
  body: string | null;
  replyToId: string | null;
  deleted: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
};
