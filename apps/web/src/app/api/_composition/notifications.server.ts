import { PostgresNotificationRepository } from "@line_bot_v1/notifications/adapters/postgres";
import { createNotifications } from "@line_bot_v1/notifications/application/notifications";
import { activeLineUser } from "./account.server";

let repository: PostgresNotificationRepository | undefined;

export const notifications = createNotifications({
  activeUser: activeLineUser,
  repository: () => (repository ??= new PostgresNotificationRepository()),
  now: () => Date.now(),
});
