import type { Sql } from "@line_bot_v1/platform/postgres";

export async function readActiveProjectTeamIds(
  sql: Sql,
  userId: string,
): Promise<readonly string[]> {
  const rows = (
    await sql.query(
      `SELECT DISTINCT team_id
       FROM team_effective_memberships
       WHERE user_id=$1
       ORDER BY team_id`,
      [userId],
    )
  ).rows as Array<{ team_id: string }>;
  return rows.map((row) => row.team_id);
}

export async function readProjectTeamOrganization(
  sql: Sql,
  teamId: string,
): Promise<string | null> {
  const row = (
    await sql.query(
      "SELECT organization_account_id FROM teams WHERE id=$1",
      [teamId],
    )
  ).rows[0] as { organization_account_id: string } | undefined;
  return row?.organization_account_id ?? null;
}
