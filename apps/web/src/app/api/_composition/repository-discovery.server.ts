import { PostgresRepositoryDiscoveryStore } from "@line-work/repository/adapters/postgres/discovery";
import { createRepositoryDiscovery } from "@line-work/repository/application/discovery";
import { activeLineUser } from "./account.server";

let store: PostgresRepositoryDiscoveryStore | undefined;

export const repositoryDiscovery = createRepositoryDiscovery({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryDiscoveryStore()),
  now: () => Date.now(),
});
