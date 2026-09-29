import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresDailyCheckInStore } from "../../adapters/outbound/persistence/postgres-daily-check-in-store.js";

export function createPostgresDailyCheckInStore(database?: Database) {
  return new PostgresDailyCheckInStore(database);
}
