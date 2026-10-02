import type { Sql } from "@line_bot_v1/platform/postgres";

export { PostgresRepositoryResourceManagementStore } from "../adapters/postgres/resource-management.js";

export async function repositoryLabelIdsExist(
  sql: Sql,
  repositoryId: string,
  labelIds: readonly string[],
): Promise<boolean> {
  if (labelIds.length === 0) return true;
  const rows = (
    await sql.query(
      `SELECT id FROM repository_labels
       WHERE repository_id=$1 AND id=ANY($2::text[])
       ORDER BY id`,
      [repositoryId, [...new Set(labelIds)]],
    )
  ).rows as Array<{ id: string }>;
  return rows.length === new Set(labelIds).size;
}

export async function repositoryMilestoneExists(
  sql: Sql,
  repositoryId: string,
  milestoneId: string,
): Promise<boolean> {
  return Boolean(
    (
      await sql.query(
        "SELECT 1 FROM repository_milestones WHERE repository_id=$1 AND id=$2",
        [repositoryId, milestoneId],
      )
    ).rows[0],
  );
}
