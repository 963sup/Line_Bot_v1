import type { Sql } from "@line_bot_v1/platform/postgres";
import { PostgresProjectContentScope } from "../../adapters/outbound/persistence/postgres-project-content-scope.js";
import type { ProjectContentScopeReader } from "../../contracts/output/content-scope.js";

export function createPostgresProjectContentScope(sql: Sql): ProjectContentScopeReader {
  return new PostgresProjectContentScope(sql);
}
