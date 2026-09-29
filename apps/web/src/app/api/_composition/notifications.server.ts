import { createNotifications } from "@line_bot_v1/notifications/application/use-cases/notifications";
import { createPostgresNotificationRepository } from "@line_bot_v1/notifications/composition/bootstrap/postgres-notification-repository";
import { activeLineUser } from "./account.server";

let repository: ReturnType<typeof createPostgresNotificationRepository> | undefined;

export const notifications = createNotifications({
  activeUser: activeLineUser,
  repository: () => (repository ??= createPostgresNotificationRepository()),
  now: () => Date.now(),
});
