import { createRepositoryAccess } from "@line_bot_v1/repository/application/access";
import { PostgresRepositoryAccessStore } from "@line_bot_v1/repository/postgres/access-management";
import { activeLineUser } from "./account.server";

let store: PostgresRepositoryAccessStore | undefined;

export const repositoryAccess = createRepositoryAccess({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryAccessStore()),
  now: Date.now,
});
