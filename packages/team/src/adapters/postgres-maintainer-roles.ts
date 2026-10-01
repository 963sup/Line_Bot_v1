import type { Sql } from "@line_bot_v1/platform/postgres";
import { teamAssert } from "../domain/errors/team-error.js";

type TeamMaintainerMutation = Readonly<{
  teamId: string;
  targetUserId: string;
  userStatusVersion: number;
  now: number;
}>;

export async function grantTeamMaintainer(
  sql: Sql,
  input: TeamMaintainerMutation,
): Promise<void> {
  const membership = (
    await sql.query(
      `SELECT status,version FROM team_memberships
       WHERE team_id=$1 AND user_id=$2 FOR SHARE`,
      [input.teamId, input.targetUserId],
    )
  ).rows[0];
  teamAssert(membership?.status === "active", 403, "TeamMaintainer 必須是有效 Team 成員。");

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
      [
        input.teamId,
        input.targetUserId,
        input.userStatusVersion,
        membership.version,
        input.now,
      ],
    );
    return;
  }

  await sql.query(
    `INSERT INTO team_role_assignments(
       team_id,user_id,role,status,version,user_status_version,membership_version,granted_at
     ) VALUES($1,$2,'TeamMaintainer','active',1,$3,$4,$5)`,
    [input.teamId, input.targetUserId, input.userStatusVersion, membership.version, input.now],
  );
}

export async function revokeTeamMaintainer(
  sql: Sql,
  input: TeamMaintainerMutation,
): Promise<void> {
  const assignment = (
    await sql.query(
      `SELECT status FROM team_role_assignments
       WHERE team_id=$1 AND user_id=$2 AND role='TeamMaintainer' FOR UPDATE`,
      [input.teamId, input.targetUserId],
    )
  ).rows[0];
  teamAssert(assignment, 404, "找不到 TeamMaintainer 指派。");
  teamAssert(assignment.status === "active", 409, "TeamMaintainer 已撤銷。");

  await sql.query(
    `UPDATE team_role_assignments SET status='revoked',version=version+1
     WHERE team_id=$1 AND user_id=$2 AND role='TeamMaintainer'`,
    [input.teamId, input.targetUserId],
  );

  void input.userStatusVersion;
  void input.now;
}
