import { createRepositoryDiscovery } from "@line_bot_v1/explore/application/queries/repository-discovery";
import { PostgresRepositoryDiscoveryStore } from "@line_bot_v1/repository/postgres/discovery";
import { activeLineUser } from "./account.server";

let store: PostgresRepositoryDiscoveryStore | undefined;

export const repositoryDiscovery = createRepositoryDiscovery({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryDiscoveryStore()),
  now: () => Date.now(),
});
