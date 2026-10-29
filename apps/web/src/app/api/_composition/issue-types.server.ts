import { createIssueTypes } from "@line_bot_v1/issue/application/issue-types";
import { PostgresIssueTypeStore } from "@line_bot_v1/issue/postgres/issue-types";
import { activeLineUser } from "./account.server";

let store: PostgresIssueTypeStore | undefined;

export const issueTypes = createIssueTypes({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresIssueTypeStore()),
  now: () => Date.now(),
});
