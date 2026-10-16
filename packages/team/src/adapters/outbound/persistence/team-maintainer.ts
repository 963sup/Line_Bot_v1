import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { activeOrganizationParticipantIds } from "@line_bot_v1/organization/postgres";
import type { Sql } from "@line_bot_v1/platform/postgres";
import { numberValue, stringValue } from "@line_bot_v1/platform/validation";

function maintainerFactRow(row: Record<string, unknown>) {
  return {
    organization_account_id: stringValue(row.organization_account_id),
    user_status_version: numberValue(row.user_status_version),
    membership_version: numberValue(row.membership_version),
    version: numberValue(row.version),
  };
}

export async function isTeamMaintainer(sql: Sql, teamId: string, userId: string): Promise<boolean> {
  const fact = (
    await sql.query(
      `SELECT t.organization_account_id,r.user_status_version,r.membership_version,m.version
       FROM team_role_assignments r
       JOIN team_memberships m
         ON m.team_id=r.team_id AND m.user_id=r.user_id
       JOIN teams t ON t.id=r.team_id
       WHERE r.team_id=$1 AND r.user_id=$2
         AND r.role='TeamMaintainer' AND r.status='active'
         AND m.status='active'`,
      [teamId, userId],
      maintainerFactRow,
    )
  ).rows[0];
  if (!fact || Number(fact.membership_version) !== Number(fact.version)) return false;

  const user = await readActiveUserQualification(sql, userId, "share");
  if (!user || user.statusVersion !== Number(fact.user_status_version)) return false;

  const participants = await activeOrganizationParticipantIds(sql, fact.organization_account_id, [
    userId,
  ]);
  return participants.has(userId);
}
