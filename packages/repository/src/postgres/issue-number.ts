import type { Sql } from "@line_bot_v1/platform/postgres";
import { RepositoryError } from "../domain.js";

export async function allocateRepositoryIssueNumber(
  sql: Sql,
  repositoryId: string,
): Promise<number> {
  const row = (
    await sql.query(
      `UPDATE repositories
       SET next_issue_number=next_issue_number+1
       WHERE id=$1
       RETURNING next_issue_number-1 AS number`,
      [repositoryId],
    )
  ).rows[0] as { number: number | string } | undefined;
  if (!row) throw new RepositoryError(404, "找不到 Repository。");
  return Number(row.number);
}
