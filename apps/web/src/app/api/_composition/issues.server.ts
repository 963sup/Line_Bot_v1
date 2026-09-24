import { PostgresIssueStore } from "@line-work/repository/adapters/postgres";
import { createIssues } from "@line-work/repository/application/issues";
import { activeLineUser } from "./account.server";

let store: PostgresIssueStore | undefined;

export const issues = createIssues({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresIssueStore()),
  now: () => Date.now(),
});
