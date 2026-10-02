import { createIssueCollaboration } from "@line_bot_v1/issue/application/collaboration";
import { PostgresIssueCollaborationStore } from "@line_bot_v1/issue/postgres/collaboration";
import { activeLineUser } from "./account.server";

let store: PostgresIssueCollaborationStore | undefined;

export const issueCollaboration = createIssueCollaboration({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresIssueCollaborationStore()),
  now: () => Date.now(),
});
