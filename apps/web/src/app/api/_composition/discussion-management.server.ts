import { createDiscussionManagement } from "@line_bot_v1/discussion/application/management";
import { PostgresDiscussionManagementStore } from "@line_bot_v1/discussion/postgres/management";
import { activeLineUser } from "./account.server";

let store: PostgresDiscussionManagementStore | undefined;

export const discussionManagement = createDiscussionManagement({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresDiscussionManagementStore()),
  now: () => Date.now(),
});
