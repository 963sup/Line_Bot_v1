import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type { LegacyProcessingHistory } from "../../../contracts/output/processing.js";

/** Reads retained pre-cutover processing evidence; current writes use Intelligence tables. */
export class PostgresLegacyProcessingHistory implements LegacyProcessingHistory {
  constructor(private readonly db: Database = businessDatabase()) {}

  read(actor: string, repositoryId: string, runId: string, revisionId?: string) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, actor, { repositoryId });
      const result = await sql.query(
        `SELECT revision.* FROM intelligence_legacy_processing_runs run JOIN intelligence_legacy_processing_revisions revision
          ON revision.repository_id=run.repository_id AND revision.run_id=run.id
         WHERE run.repository_id=$1 AND run.id=$2 AND (($3::uuid IS NULL AND revision.id=run.head_revision_id) OR revision.id=$3)`,
        [repositoryId, runId, revisionId ?? null],
      );
      return result.rows[0] ?? null;
    });
  }

  list(actor: string, repositoryId: string, fileId: string, after?: string) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, actor, { repositoryId });
      return (
        await sql.query(
          `SELECT revision.* FROM intelligence_legacy_processing_runs run JOIN intelligence_legacy_processing_revisions revision
            ON revision.repository_id=run.repository_id AND revision.run_id=run.id AND revision.id=run.head_revision_id
           WHERE run.repository_id=$1 AND run.file_id=$2 AND ($3::uuid IS NULL OR revision.run_id>$3)
           ORDER BY revision.run_id LIMIT 21`,
          [repositoryId, fileId, after ?? null],
        )
      ).rows;
    });
  }
}
