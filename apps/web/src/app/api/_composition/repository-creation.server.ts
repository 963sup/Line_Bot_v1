import { PostgresRepositoryCreationStore } from "@line-work/repository/adapters/postgres/creation";
import { createRepositoryCreation } from "@line-work/repository/application/creation";
import { activeLineUser } from "./account.server";

let store: PostgresRepositoryCreationStore | undefined;

export const repositoryCreation = createRepositoryCreation({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryCreationStore()),
  now: () => Date.now(),
});
