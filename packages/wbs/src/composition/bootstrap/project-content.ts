import type { ContentWbsExpansionReader } from "@line_bot_v1/content/contracts/output/wbs-expansion";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import { PostgresProjectWbsStore } from "../../adapters/outbound/persistence/project-content.js";
import type { ProjectWbsStore } from "../../contracts/repositories/project-content.js";

/** Host provides the Content reader in the same SQL transaction; WBS owns WBS writes. */
export function createPostgresProjectWbsStore(
  config: Readonly<{ contentReader: (sql: Sql) => ContentWbsExpansionReader; db?: Database }>,
): ProjectWbsStore {
  return new PostgresProjectWbsStore(config.db ?? businessDatabase(), config.contentReader);
}
