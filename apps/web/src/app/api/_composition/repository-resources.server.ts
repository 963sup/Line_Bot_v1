import { PostgresRepositoryResourceStore } from "@line-work/repository/adapters/postgres/resources";
import { createRepositoryResources } from "@line-work/repository/application/resources";
import { activeLineUser } from "./account.server";

let store: PostgresRepositoryResourceStore | undefined;

export const repositoryResources = createRepositoryResources({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryResourceStore()),
});
