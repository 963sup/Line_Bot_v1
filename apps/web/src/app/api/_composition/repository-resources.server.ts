import { PostgresRepositoryResourceStore } from "@line_bot_v1/repository/adapters/postgres/resources";
import { createRepositoryResources } from "@line_bot_v1/repository/application/resources";
import { activeLineUser } from "./account.server";

let store: PostgresRepositoryResourceStore | undefined;

export const repositoryResources = createRepositoryResources({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryResourceStore()),
});
