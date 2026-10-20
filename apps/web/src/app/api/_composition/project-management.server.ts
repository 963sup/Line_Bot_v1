import { createProjectManagement } from "@line_bot_v1/project/application/management";
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

export async function projectActorUserId(subject: string) {
  return (await activeLineUser(subject)).id;
}

export async function projectUserById(userId: string) {
  return publicUserById(userId);
}

export async function projectUserByLogin(login: string) {
  const account = await resolveAccountNamespace(login);
  if (!account || account.kind !== "USER") return null;
  return publicUserById(account.id);
}
