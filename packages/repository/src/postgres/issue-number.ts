import type { Sql } from "@line_bot_v1/platform/postgres";
import { numericValue } from "@line_bot_v1/platform/validation";
import { RepositoryError } from "../contracts/repository.js";

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
      (row) => ({ number: numericValue(row.number) }),
    )
  ).rows[0];
  if (!row) throw new RepositoryError(404, "找不到 Repository。");
  return Number(row.number);
}
