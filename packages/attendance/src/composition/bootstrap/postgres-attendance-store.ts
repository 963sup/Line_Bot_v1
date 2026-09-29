import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresAttendanceStore } from "../../adapters/outbound/persistence/postgres-attendance-store.js";

export function createPostgresAttendanceStore(database?: Database) {
  return new PostgresAttendanceStore(database);
}
