export type RepositorySelector =
  | { repositoryId: string }
  | { ownerLogin: string; repositoryName: string };
