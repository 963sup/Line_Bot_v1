import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import type { Sql } from "@line_bot_v1/platform/postgres";
import { TeamError } from "../domain/errors/team-error.js";

async function isEffectiveTeamMaintainer(sql: Sql, teamId: string, userId: string) {
  return Boolean(
    (
      await sql.query(
        `SELECT 1
         FROM team_role_assignments r
         JOIN team_memberships m ON m.team_id=r.team_id AND m.user_id=r.user_id
         JOIN teams t ON t.id=r.team_id
         JOIN organizations o ON o.account_id=t.organization_account_id
         JOIN organization_memberships om
           ON om.organization_account_id=t.organization_account_id AND om.user_id=r.user_id
         JOIN users u ON u.id=r.user_id
         WHERE r.team_id=$1 AND r.user_id=$2
           AND r.role='TeamMaintainer' AND r.status='active'
           AND m.status='active' AND o.status='active' AND om.status='active' AND u.status='active'
           AND r.user_status_version=u.status_version
           AND r.membership_version=m.version`,
        [teamId, userId],
      )
    ).rows[0],
  );
}

async function hasReplacementTeamMaintainer(
  sql: Sql,
  teamId: string,
  excludedUserId: string,
) {
  return Boolean(
    (
      await sql.query(
        `SELECT 1
         FROM team_role_assignments r
         JOIN team_memberships m ON m.team_id=r.team_id AND m.user_id=r.user_id
         JOIN teams t ON t.id=r.team_id
         JOIN organizations o ON o.account_id=t.organization_account_id
         JOIN organization_memberships om
           ON om.organization_account_id=t.organization_account_id AND om.user_id=r.user_id
         JOIN users u ON u.id=r.user_id
         WHERE r.team_id=$1 AND r.user_id<>$2
           AND r.role='TeamMaintainer' AND r.status='active'
           AND m.status='active' AND o.status='active' AND om.status='active' AND u.status='active'
           AND r.user_status_version=u.status_version
           AND r.membership_version=m.version
         LIMIT 1`,
        [teamId, excludedUserId],
      )
    ).rows[0],
  );
}

export async function grantTeamMaintainer(
  sql: Sql,
  input: { teamId: string; targetUserId: string; userStatusVersion: number; now: number },
): Promise<void> {
  const target = await readActiveUserQualification(sql, input.targetUserId, "share");
  if (!target || target.statusVersion !== input.userStatusVersion) {
    throw new TeamError(409, "使用者資格版本已更新。");
  }
  const membership = (
    await sql.query(
      `SELECT m.version
       FROM team_memberships m
       JOIN teams t ON t.id=m.team_id
       JOIN organizations o ON o.account_id=t.organization_account_id
       JOIN organization_memberships om
         ON om.organization_account_id=t.organization_account_id AND om.user_id=m.user_id
       WHERE m.team_id=$1 AND m.user_id=$2
         AND m.status='active' AND o.status='active' AND om.status='active'`,
      [input.teamId, input.targetUserId],
    )
  ).rows[0];
  if (!membership) {
    throw new TeamError(403, "TeamMaintainer 必須是有效 Team 成員。");
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
  if (
    (await isEffectiveTeamMaintainer(sql, input.teamId, input.targetUserId)) &&
    !(await hasReplacementTeamMaintainer(sql, input.teamId, input.targetUserId))
  ) {
    throw new TeamError(409, "不能撤銷最後一位有效 TeamMaintainer。");
  }
  await sql.query(
    `UPDATE team_role_assignments SET status='revoked',version=version+1
     WHERE team_id=$1 AND user_id=$2 AND role='TeamMaintainer'`,
    [input.teamId, input.targetUserId],
  );
}
