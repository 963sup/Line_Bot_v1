import { createProjectManagement } from "@line_bot_v1/project/application/management";
import { createPostgresProjectManagementStore } from "@line_bot_v1/project/composition/bootstrap/postgres-project-management-store";
import { activeLineUser } from "./account.server";

let store: ReturnType<typeof createPostgresProjectManagementStore> | undefined;

export const projectManagement = createProjectManagement({
  activeUser: activeLineUser,
  store: () => (store ??= createPostgresProjectManagementStore()),
  now: () => Date.now(),
});
