export type StarredRepository = {
  id: string;
  ownerLogin: string;
  name: string;
  visibility: string;
  starredAt: number;
  starCount: number;
};

export interface RepositoryStarStore {
  star(userId: string, repositoryId: string, at: number): Promise<void>;
  unstar(userId: string, repositoryId: string): Promise<void>;
  starred(userId: string): Promise<StarredRepository[]>;
}
