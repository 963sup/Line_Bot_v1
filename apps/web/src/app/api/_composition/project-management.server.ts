import { createProjectManagement } from "@line_bot_v1/project/application/management";
import { createProjectUsers } from "@line_bot_v1/project/application/queries/project-users";
import {
  createPostgresProjectLifecycle,
  createPostgresProjectManagementStore,
} from "@line_bot_v1/project/composition/bootstrap/postgres-project-management-store";
import { activeLineUser, publicUserById } from "./account.server";
import { resolveAccountNamespace } from "./namespace.server";

let store: ReturnType<typeof createPostgresProjectManagementStore> | undefined;
let lifecycle: ReturnType<typeof createPostgresProjectLifecycle> | undefined;

export const projectManagement = createProjectManagement({
  activeUser: activeLineUser,
  store: () => (store ??= createPostgresProjectManagementStore()),
  lifecycle: () => (lifecycle ??= createPostgresProjectLifecycle()),
  now: () => Date.now(),
});

export const projectUsers = createProjectUsers({
  view: projectManagement.view,
  actorUserId: async (subject) => (await activeLineUser(subject)).id,
  userById: publicUserById,
  userByLogin: async (login) => {
    const account = await resolveAccountNamespace(login);
    if (!account || account.kind !== "USER") return null;
    return publicUserById(account.id);
  },
});
