import { createRepositoryStars } from "@line_bot_v1/repository/application/stars";
import { PostgresRepositoryStarStore } from "@line_bot_v1/repository/postgres";
import { activeLineUser } from "./account.server";

let store: PostgresRepositoryStarStore | undefined;

export const repositoryStars = createRepositoryStars({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryStarStore()),
  now: () => Date.now(),
});
