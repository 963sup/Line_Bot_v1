import { createRepositoryResourceManagement } from "@line_bot_v1/repository/application/resource-management";
import { PostgresRepositoryResourceManagementStore } from "@line_bot_v1/repository/postgres/resource-management";
import { activeLineUser } from "./account.server";

let store: PostgresRepositoryResourceManagementStore | undefined;

export const repositoryResourceManagement = createRepositoryResourceManagement({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryResourceManagementStore()),
  now: Date.now,
});
