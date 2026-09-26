export type PublicRepository = Readonly<{
  id: string;
  ownerLogin: string;
  name: string;
}>;

export type PublicRepositoryList = Readonly<{
  items: PublicRepository[];
  totalCount: number;
}>;

export interface PublicRepositoryStore {
  byOwnerAndName(ownerLogin: string, name: string): Promise<PublicRepository | null>;
  listByOwner(ownerLogin: string, limit: number): Promise<PublicRepositoryList>;
}
