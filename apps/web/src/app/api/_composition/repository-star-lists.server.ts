import { PostgresRepositoryStarListStore } from "@line_bot_v1/repository/adapters/postgres/star-lists";
import { createRepositoryStarLists } from "@line_bot_v1/repository/application/star-lists";
import { activeLineUser } from "./account.server";

let store: PostgresRepositoryStarListStore | undefined;

export const repositoryStarLists = createRepositoryStarLists({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryStarListStore()),
  now: () => Date.now(),
});
