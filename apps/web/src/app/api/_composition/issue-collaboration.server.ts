import { createIssueCollaboration } from "@line_bot_v1/issue/application/collaboration";
import { createPostgresIssueCollaborationStore } from "@line_bot_v1/issue/composition/bootstrap/collaboration";
import type { IssueCollaborationStore } from "@line_bot_v1/issue/contracts/collaboration";
import { activeLineUser } from "./account.server";

let store: IssueCollaborationStore | undefined;

export const issueCollaboration = createIssueCollaboration({
  activeUser: activeLineUser,
  store: () => (store ??= createPostgresIssueCollaborationStore()),
  now: () => Date.now(),
});
