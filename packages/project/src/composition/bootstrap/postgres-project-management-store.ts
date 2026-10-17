import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresProjectManagementStore } from "../../adapters/outbound/persistence/postgres-project-management-store.js";
import type { ProjectManagementStore } from "../../contracts/management.js";

export function createPostgresProjectManagementStore(
  db: Database = businessDatabase(),
): ProjectManagementStore {
  return new PostgresProjectManagementStore(db);
}
