import { PostgresRepositoryStarListStore } from "@line-work/repository/adapters/postgres/star-lists";
import { createRepositoryStarLists } from "@line-work/repository/application/star-lists";
import { activeLineUser } from "./account.server";

let store: PostgresRepositoryStarListStore | undefined;

export const repositoryStarLists = createRepositoryStarLists({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryStarListStore()),
  now: () => Date.now(),
});
