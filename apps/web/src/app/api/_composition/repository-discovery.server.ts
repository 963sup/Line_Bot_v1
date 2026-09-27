import { PostgresRepositoryDiscoveryStore } from "@line_bot_v1/repository/adapters/postgres/discovery";
import { createRepositoryDiscovery } from "@line_bot_v1/repository/application/discovery";
import { activeLineUser } from "./account.server";

let store: PostgresRepositoryDiscoveryStore | undefined;

export const repositoryDiscovery = createRepositoryDiscovery({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryDiscoveryStore()),
  now: () => Date.now(),
});
