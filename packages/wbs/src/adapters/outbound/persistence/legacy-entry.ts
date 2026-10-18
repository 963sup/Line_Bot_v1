import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import { booleanValue } from "@line_bot_v1/platform/validation";
import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type {
  LegacyWbsEntry,
  LegacyWbsEntryQuery,
} from "../../../contracts/output/legacy-entry.js";

async function sourceRelationExists(sql: Sql) {
  return booleanValue(
    (
      await sql.query("SELECT to_regclass($1::text) IS NOT NULL AS present", [
        "app_private.repository_wbs",
      ])
    ).rows[0]?.present,
  );
}

async function hasSourceFact(sql: Sql, repositoryId: string) {
  if (!(await sourceRelationExists(sql))) return false;
  // Every source Revision, content/governance receipt and governance row is FK-rooted here.
  // Activated receipt evidence is checked separately because it survives source-table retirement.
  return Boolean(
    (await sql.query("SELECT 1 FROM repository_wbs WHERE repository_id=$1 LIMIT 1", [repositoryId]))
      .rows.length,
  );
}

export class PostgresLegacyWbsEntryQuery implements LegacyWbsEntryQuery {
  constructor(private readonly db: Database = businessDatabase()) {}

  read(userId: string, selector: RepositorySelector): Promise<LegacyWbsEntry> {
    return this.db.transaction(async (sql) => {
      const { repository } = await repositoryContentScope(sql, userId, selector);
      const durableRecoveryFact = (
        await sql.query(
          `SELECT
             EXISTS(
               SELECT 1 FROM legacy_wbs_command_evidence
               WHERE repository_id=$1
             ) OR EXISTS(
               SELECT 1 FROM wbs_scope_transfers
               WHERE repository_id=$1 AND actor_user_id=$2
                 AND state IN ('REQUESTED','ACTIVE')
             ) AS entry_required`,
          [repository.id, userId],
          (row) => ({ entryRequired: booleanValue(row.entry_required) }),
        )
      ).rows[0];
      if (durableRecoveryFact?.entryRequired) return { entryRequired: true };

      return { entryRequired: await hasSourceFact(sql, repository.id) };
    });
  }
}
