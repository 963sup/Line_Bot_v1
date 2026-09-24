import { PostgresNotificationRepository } from "@line-work/notifications/adapters/postgres";
import { createNotifications } from "@line-work/notifications/application/notifications";
import { activeLineUser } from "./account.server";

let repository: PostgresNotificationRepository | undefined;

export const notifications = createNotifications({
  activeUser: activeLineUser,
  repository: () => (repository ??= new PostgresNotificationRepository()),
  now: () => Date.now(),
});
