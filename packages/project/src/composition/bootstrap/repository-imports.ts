import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresProjectRepositoryImports } from "../../adapters/outbound/persistence/postgres-project-repository-imports.js";

export function createProjectRepositoryImports(db: Database = businessDatabase()) {
  return new PostgresProjectRepositoryImports(db);
}
