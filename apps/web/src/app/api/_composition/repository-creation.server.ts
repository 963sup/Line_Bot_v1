import { PostgresRepositoryCreationStore } from "@line_bot_v1/repository/adapters/postgres/creation";
import { createRepositoryCreation } from "@line_bot_v1/repository/application/creation";
import { activeLineUser } from "./account.server";

let store: PostgresRepositoryCreationStore | undefined;

export const repositoryCreation = createRepositoryCreation({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryCreationStore()),
  now: () => Date.now(),
});
