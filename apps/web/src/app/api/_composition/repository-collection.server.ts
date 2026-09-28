import { PostgresRepositoryCollectionStore } from "@line_bot_v1/repository/adapters/postgres/collection";
import { createRepositoryCollection } from "@line_bot_v1/repository/application/collection";
import { activeLineUser } from "./account.server";

let store: PostgresRepositoryCollectionStore | undefined;

export const repositoryCollection = createRepositoryCollection({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryCollectionStore()),
});
