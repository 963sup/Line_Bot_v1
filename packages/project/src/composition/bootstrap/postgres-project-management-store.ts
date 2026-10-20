import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresProjectLifecycle } from "../../adapters/outbound/persistence/postgres-project-lifecycle.js";
import { PostgresProjectManagementStore } from "../../adapters/outbound/persistence/postgres-project-management-store.js";
import type { ProjectManagementStore } from "../../contracts/management.js";
import type { ProjectLifecyclePersistence } from "../../contracts/output/project-lifecycle.js";

export function createPostgresProjectManagementStore(
  db: Database = businessDatabase(),
): ProjectManagementStore {
  return new PostgresProjectManagementStore(db);
}

export function createPostgresProjectLifecycle(
  db: Database = businessDatabase(),
): ProjectLifecyclePersistence {
  return new PostgresProjectLifecycle(db);
}
