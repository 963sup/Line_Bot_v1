import type { ContentWbsExpansionReader } from "@line_bot_v1/content/contracts/output/wbs-expansion";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import { PostgresProjectWbsStore } from "../../adapters/outbound/persistence/project-content.js";
import type { ProjectWbsStore } from "../../contracts/repositories/project-content.js";
import { WbsError } from "../../domain/document.js";

// Ordinary WBS edits need no Content reader; importing Content must fail closed if not wired.
const uncomposedContentReader = (): ContentWbsExpansionReader => ({
  read: async () => {
    throw new WbsError(503, "Content WBS reader is not composed by the application host.");
  },
});

export function createPostgresProjectWbsStore(
  db?: Database,
  contentReader: (sql: Sql) => ContentWbsExpansionReader = uncomposedContentReader,
): ProjectWbsStore {
  return new PostgresProjectWbsStore(db ?? businessDatabase(), contentReader);
}
