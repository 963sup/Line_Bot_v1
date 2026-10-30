import { createDiscussionManagement } from "@line_bot_v1/discussion/application/management";
import { PostgresDiscussionManagementStore } from "@line_bot_v1/discussion/postgres/management";
import { repositoryArchived, repositoryScope } from "@line_bot_v1/repository/postgres/access";
import { repositoryLabelIdsExist } from "@line_bot_v1/repository/postgres/resource-management";
import { activeLineUser } from "./account.server";

const repositoryAccess = {
  scope: repositoryScope,
  archived: repositoryArchived,
  labelIdsExist: repositoryLabelIdsExist,
};

let store: PostgresDiscussionManagementStore | undefined;

export const discussionManagement = createDiscussionManagement({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresDiscussionManagementStore(repositoryAccess)),
  now: () => Date.now(),
});
