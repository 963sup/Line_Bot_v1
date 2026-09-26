import { PostgresRepositoryCollectionStore } from "@line-work/repository/adapters/postgres/collection";
import { createRepositoryCollection } from "@line-work/repository/application/collection";
import { activeLineUser } from "./account.server";

let store: PostgresRepositoryCollectionStore | undefined;

export const repositoryCollection = createRepositoryCollection({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryCollectionStore()),
});
