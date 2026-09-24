import { PostgresRepositoryStarStore } from "@line-work/repository/adapters/postgres";
import { createRepositoryStars } from "@line-work/repository/application/stars";
import { activeLineUser } from "./account.server";

let store: PostgresRepositoryStarStore | undefined;

export const repositoryStars = createRepositoryStars({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryStarStore()),
  now: () => Date.now(),
});
