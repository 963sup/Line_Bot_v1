import { createRepositoryManagement } from "@line_bot_v1/repository/application/management";
import { PostgresRepositoryManagementStore } from "@line_bot_v1/repository/postgres/management";
import { activeLineUser } from "./account.server";

let store: PostgresRepositoryManagementStore | undefined;

export const repositoryManagement = createRepositoryManagement({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryManagementStore()),
  now: Date.now,
});
