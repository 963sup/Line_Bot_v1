import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresNotificationRepository } from "../../adapters/outbound/persistence/postgres-notification-repository.js";
import type { NotificationRepository } from "../../contracts/repositories/notification-repository.js";

export function createPostgresNotificationRepository(database?: Database): NotificationRepository {
  return new PostgresNotificationRepository(database);
}
