import { createIssueActivity } from "@line_bot_v1/issue/application/activity";
import { PostgresIssueActivityStore } from "@line_bot_v1/issue/postgres/activity";
import { activeLineUser } from "./account.server";

let store: PostgresIssueActivityStore | undefined;

export const issueActivity = createIssueActivity({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresIssueActivityStore()),
});
