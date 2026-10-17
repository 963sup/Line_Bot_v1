import type { Sql } from "@line_bot_v1/platform/postgres";
import { PostgresNotificationTransferFacts } from "../../adapters/outbound/persistence/transfer-facts.js";
import type { NotificationTransferFacts } from "../../contracts/output/transfer-facts.js";

export function createPostgresNotificationTransferFacts(sql: Sql): NotificationTransferFacts {
  return new PostgresNotificationTransferFacts(sql);
}
