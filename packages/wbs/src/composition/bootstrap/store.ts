import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresWbsStore } from "../../adapters/outbound/persistence/store.js";

export function createPostgresWbsStore(db?: Database) {
  return new PostgresWbsStore(db);
}
