import type { RepositorySummary } from "@line_bot_v1/repository/domain";
import type {
  Discussion,
  DiscussionCloseReason,
  DiscussionComment,
  DiscussionLockReason,
} from "../domain.js";

export type DiscussionCategory = Readonly<{
  id: string;
  repositoryId: string;
  name: string;
  slug: string;
  description: string;
  emoji: string;
  isAnswerable: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
}>;

type DiscussionPollOption = Readonly<{
  id: string;
  option: string;
  position: number;
  version: number;
  voteCount: number;
  viewerHasVoted: boolean;
}>;

export type DiscussionPoll = Readonly<{
  id: string;
  question: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  totalVoteCount: number;
  viewerHasVoted: boolean;
  options: readonly DiscussionPollOption[];
}>;

type DiscussionAnswer = Readonly<{
  commentId: string;
  chosenBy: string;
  chosenAt: number;
}>;

export type DiscussionManagementView = Readonly<{
  repository: RepositorySummary;
  categories: readonly DiscussionCategory[];
  discussion: Discussion | null;
  comments: readonly DiscussionComment[];
  labelIds: readonly string[];
  answer: DiscussionAnswer | null;
  discussionUpvoteCount: number;
  viewerHasUpvotedDiscussion: boolean;
  commentUpvotes: Readonly<Record<string, Readonly<{ count: number; viewerHasUpvoted: boolean }>>>;
  poll: DiscussionPoll | null;
}>;

type CommandBase = Readonly<{
  requestId: string;
  repositoryId: string;
}>;

type ExistingDiscussionBase = CommandBase &
  Readonly<{
    discussionId: string;
    expectedVersion: number;
  }>;

export type DiscussionManagementCommand =
  | (CommandBase &
      Readonly<{
        action: "create-category";
        expectedVersion: 0;
        name: string;
        slug: string;
        description: string;
        emoji: string;
        isAnswerable: boolean;
      }>)
  | (CommandBase &
      Readonly<{
        action: "update-category";
        categoryId: string;
        expectedVersion: number;
        name?: string;
        description?: string;
        emoji?: string;
        isAnswerable?: boolean;
      }>)
  | (CommandBase &
      Readonly<{
        action: "delete-category";
        categoryId: string;
        expectedVersion: number;
      }>)
  | (CommandBase &
      Readonly<{
        action: "create-discussion";
        expectedVersion: 0;
        categoryId: string;
        title: string;
        body: string;
      }>)
  | (ExistingDiscussionBase & Readonly<{ action: "adopt-discussion"; categoryId: string }>)
  | (ExistingDiscussionBase &
      Readonly<{
        action: "update-discussion";
        title?: string;
        body?: string;
        categoryId?: string;
      }>)
  | (ExistingDiscussionBase &
      Readonly<{ action: "close-discussion"; stateReason: DiscussionCloseReason | null }>)
  | (ExistingDiscussionBase & Readonly<{ action: "reopen-discussion" | "delete-discussion" }>)
  | (ExistingDiscussionBase &
      Readonly<{
        action: "add-comment";
        body: string;
        replyToId: string | null;
      }>)
  | (ExistingDiscussionBase &
      Readonly<{
        action: "edit-comment";
        commentId: string;
        commentVersion: number;
        body: string;
      }>)
  | (ExistingDiscussionBase &
      Readonly<{
        action: "delete-comment";
        commentId: string;
        commentVersion: number;
      }>)
  | (ExistingDiscussionBase &
      Readonly<{
        action: "mark-answer" | "unmark-answer";
        commentId: string;
      }>)
  | (ExistingDiscussionBase &
      Readonly<{
        action: "add-labels" | "remove-labels";
        labelIds: readonly string[];
      }>)
  | (ExistingDiscussionBase & Readonly<{ action: "clear-labels" }>)
  | (ExistingDiscussionBase &
      Readonly<{
        action: "add-upvote" | "remove-upvote";
        subjectKind: "discussion" | "comment";
        subjectId: string;
      }>)
  | (ExistingDiscussionBase &
      Readonly<{
        action: "create-poll";
        question: string;
        options: readonly string[];
      }>)
  | (ExistingDiscussionBase &
      Readonly<{
        action: "update-poll";
        pollId: string;
        pollVersion: number;
        question: string;
      }>)
  | (ExistingDiscussionBase &
      Readonly<{
        action: "replace-poll-options";
        pollId: string;
        pollVersion: number;
        options: readonly string[];
      }>)
  | (ExistingDiscussionBase &
      Readonly<{
        action: "add-poll-vote" | "remove-poll-vote";
        optionId: string;
      }>)
  | (ExistingDiscussionBase &
      Readonly<{ action: "lock"; reason: DiscussionLockReason }>)
  | (ExistingDiscussionBase & Readonly<{ action: "unlock" }>);

export type DiscussionManagementReceipt = Readonly<{
  requestId: string;
  repositoryId: string;
  action: DiscussionManagementCommand["action"];
  discussionId: string | null;
  categoryId: string | null;
  resourceId: string | null;
  version: number;
  at: number;
  data: Readonly<Record<string, unknown>>;
}>;

export type DiscussionManagementIdentity = Readonly<{ userId: string }>;

export interface DiscussionManagementStore {
  view(
    identity: DiscussionManagementIdentity,
    repositoryId: string,
    discussionId?: string,
  ): Promise<DiscussionManagementView>;
  execute(
    identity: DiscussionManagementIdentity,
    command: DiscussionManagementCommand,
    now: number,
  ): Promise<DiscussionManagementReceipt>;
}
