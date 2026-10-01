export type DiscussionSummary = {
  id: string;
  repositoryId: string;
  author: string;
  title: string;
  category: string;
  version: number;
  createdAt: number;
  updatedAt: number;
};

export type Discussion = DiscussionSummary & { body: string };

export type DiscussionComment = {
  id: string;
  discussionId: string;
  author: string;
  body: string;
  version: number;
  createdAt: number;
};
