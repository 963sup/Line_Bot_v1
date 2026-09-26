export type PublicRepository = Readonly<{
  id: string;
  ownerLogin: string;
  name: string;
}>;

export type PopularPublicRepository = PublicRepository &
  Readonly<{
    starCount: number;
  }>;

export type PublicRepositoryList = Readonly<{
  items: PublicRepository[];
  totalCount: number;
}>;

export type PopularPublicRepositoryList = Readonly<{
  items: PopularPublicRepository[];
  totalCount: number;
}>;

export interface PublicRepositoryStore {
  byOwnerAndName(ownerLogin: string, name: string): Promise<PublicRepository | null>;
  listByOwner(ownerLogin: string, limit: number): Promise<PublicRepositoryList>;
  popularByOwner(ownerLogin: string, limit: number): Promise<PopularPublicRepositoryList>;
}
