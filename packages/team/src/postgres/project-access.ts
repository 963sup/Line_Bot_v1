import type { Sql } from "@line_bot_v1/platform/postgres";
import { stringValue } from "@line_bot_v1/platform/validation";

function teamIdRow(row: Record<string, unknown>) {
  return { team_id: stringValue(row.team_id) };
}

function organizationIdRow(row: Record<string, unknown>) {
  return { organization_account_id: stringValue(row.organization_account_id) };
}

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
      teamIdRow,
    )
  ).rows;
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
      organizationIdRow,
    )
  ).rows[0];
  return row?.organization_account_id ?? null;
}
