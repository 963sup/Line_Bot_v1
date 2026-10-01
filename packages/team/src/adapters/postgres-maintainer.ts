import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { activeOrganizationParticipantIds } from "@line_bot_v1/organization/postgres";
import type { Sql } from "@line_bot_v1/platform/postgres";
import { TeamError } from "../domain/errors/team-error.js";

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
    )
  ).rows[0] as
    | {
        organization_account_id: string;
        user_status_version: number;
        membership_version: number;
        version: number;
      }
    | undefined;
  if (!fact || Number(fact.membership_version) !== Number(fact.version)) return false;

  const user = await readActiveUserQualification(sql, userId, "share");
  if (!user || user.statusVersion !== Number(fact.user_status_version)) return false;

  const participants = await activeOrganizationParticipantIds(sql, fact.organization_account_id, [
    userId,
  ]);
  return participants.has(userId);
}

export async function grantTeamMaintainer(
  sql: Sql,
  input: {
    teamId: string;
    organizationAccountId: string;
    targetUserId: string;
    userStatusVersion: number;
    now: number;
  },
): Promise<void> {
  const target = await readActiveUserQualification(sql, input.targetUserId, "share");
  if (!target || target.statusVersion !== input.userStatusVersion) {
    throw new TeamError(409, "使用者資格版本已更新。");
  }
  const participants = await activeOrganizationParticipantIds(sql, input.organizationAccountId, [
    input.targetUserId,
  ]);
  if (!participants.has(input.targetUserId)) {
    throw new TeamError(403, "TeamMaintainer 必須是有效 Organization member。");
  }
  const membership = (
    await sql.query(
      `SELECT version FROM team_memberships
       WHERE team_id=$1 AND user_id=$2 AND status='active'`,
      [input.teamId, input.targetUserId],
    )
  ).rows[0];
  if (!membership) {
    throw new TeamError(403, "TeamMaintainer 必須是有效 Team member。");
  }
  const assignment = (
    await sql.query(
      `SELECT status,user_status_version,membership_version FROM team_role_assignments
       WHERE team_id=$1 AND user_id=$2 AND role='TeamMaintainer' FOR UPDATE`,
      [input.teamId, input.targetUserId],
    )
  ).rows[0];
  if (
    assignment?.status === "active" &&
    assignment.user_status_version === input.userStatusVersion &&
    assignment.membership_version === membership.version
  ) {
    return;
  }
  if (assignment) {
    await sql.query(
      `UPDATE team_role_assignments SET status='active',version=version+1,
       user_status_version=$3,membership_version=$4,granted_at=$5
       WHERE team_id=$1 AND user_id=$2 AND role='TeamMaintainer'`,
      [input.teamId, input.targetUserId, input.userStatusVersion, membership.version, input.now],
    );
  } else {
    await sql.query(
      `INSERT INTO team_role_assignments(
         team_id,user_id,role,status,version,user_status_version,membership_version,granted_at
       ) VALUES($1,$2,'TeamMaintainer','active',1,$3,$4,$5)`,
      [input.teamId, input.targetUserId, input.userStatusVersion, membership.version, input.now],
    );
  }
}

export async function revokeTeamMaintainer(
  sql: Sql,
  input: { teamId: string; targetUserId: string },
): Promise<void> {
  const assignment = (
    await sql.query(
      `SELECT status FROM team_role_assignments
       WHERE team_id=$1 AND user_id=$2 AND role='TeamMaintainer' FOR UPDATE`,
      [input.teamId, input.targetUserId],
    )
  ).rows[0];
  if (!assignment) {
    throw new TeamError(404, "找不到 TeamMaintainer 指派。");
  }
  if (assignment.status !== "active") {
    throw new TeamError(409, "TeamMaintainer 已撤銷。");
  }
  if (await isTeamMaintainer(sql, input.teamId, input.targetUserId)) {
    const candidates = (
      await sql.query(
        `SELECT user_id FROM team_role_assignments
         WHERE team_id=$1 AND user_id<>$2
           AND role='TeamMaintainer' AND status='active'
         ORDER BY user_id`,
        [input.teamId, input.targetUserId],
      )
    ).rows as Array<{ user_id: string }>;
    let replacement = false;
    for (const candidate of candidates) {
      if (await isTeamMaintainer(sql, input.teamId, candidate.user_id)) {
        replacement = true;
        break;
      }
    }
    if (!replacement) {
      throw new TeamError(409, "不能撤銷最後一位有效 TeamMaintainer。");
    }
  }
  await sql.query(
    `UPDATE team_role_assignments SET status='revoked',version=version+1
     WHERE team_id=$1 AND user_id=$2 AND role='TeamMaintainer'`,
    [input.teamId, input.targetUserId],
  );
}
