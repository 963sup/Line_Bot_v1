export type PublicRepository = Readonly<{
  id: string;
  ownerLogin: string;
  name: string;
}>;

export interface PublicRepositoryStore {
  byOwnerAndName(ownerLogin: string, name: string): Promise<PublicRepository | null>;
}
