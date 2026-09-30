import { createIssues } from "@line_bot_v1/issue/application/issues";
import { PostgresIssueStore } from "@line_bot_v1/issue/postgres";
import { activeLineUser } from "./account.server";

let store: PostgresIssueStore | undefined;

export const issues = createIssues({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresIssueStore()),
  now: () => Date.now(),
});
