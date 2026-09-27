import { PostgresIssueStore } from "@line_bot_v1/repository/adapters/postgres";
import { createIssues } from "@line_bot_v1/repository/application/issues";
import { activeLineUser } from "./account.server";

let store: PostgresIssueStore | undefined;

export const issues = createIssues({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresIssueStore()),
  now: () => Date.now(),
});
