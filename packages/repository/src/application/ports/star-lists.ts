export type RepositoryStarListVisibility = "private" | "public";

export type RepositoryStarListSummary = Readonly<{
  id: string;
  ownerLogin: string;
  name: string;
  description: string;
  visibility: RepositoryStarListVisibility;
  version: number;
  visibleRepositoryCount: number;
  createdAt: number;
  updatedAt: number;
}>;

export type RepositoryStarListRepository = Readonly<{
  id: string;
  ownerLogin: string;
  name: string;
  visibility: string;
}>;

export type RepositoryStarListDetail = RepositoryStarListSummary &
  Readonly<{
    editable: boolean;
    repositories: RepositoryStarListRepository[];
  }>;

export type RepositoryStarListCreateCommand = Readonly<{
  requestId: string;
  name: string;
  description: string;
}>;

type VersionedListCommand = Readonly<{
  requestId: string;
  listId: string;
  expectedVersion: number;
}>;

export type RepositoryStarListCommand = VersionedListCommand &
  (
    | Readonly<{ action: "update"; name: string; description: string }>
    | Readonly<{ action: "publish" | "unpublish" | "delete" }>
    | Readonly<{ action: "add" | "remove"; repositoryId: string }>
  );

export type RepositoryStarListMutationResult = Readonly<{
  id: string;
  version: number;
  visibility: RepositoryStarListVisibility;
  deleted: boolean;
}>;

export interface RepositoryStarListStore {
  mine(userId: string): Promise<RepositoryStarListSummary[]>;
  detail(userId: string, listId: string): Promise<RepositoryStarListDetail>;
  create(
    userId: string,
    command: RepositoryStarListCreateCommand,
    at: number,
  ): Promise<RepositoryStarListMutationResult>;
  execute(
    userId: string,
    command: RepositoryStarListCommand,
    at: number,
  ): Promise<RepositoryStarListMutationResult>;
}
