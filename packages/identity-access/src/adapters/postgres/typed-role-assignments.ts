import { GovernanceAccessError } from "@line-work/identity-access/domain/role-assignment";
import type { Sql } from "@line-work/platform/adapters/postgres";
import { requireActiveTargetUser } from "./actor.js";

export async function hasEnterpriseOwnerAssignment(sql: Sql, enterpriseId: string, userId: string) {
  return Boolean(
    (
      await sql.query(
        `SELECT 1
         FROM enterprise_role_assignments r
         JOIN identity_access_enterprise_subjects s
           ON s.enterprise_account_id=r.enterprise_account_id AND s.user_id=r.user_id
         WHERE r.enterprise_account_id=$1 AND r.user_id=$2
           AND r.role='EnterpriseOwner' AND r.status='active'
           AND s.affiliation_status='active' AND s.user_status='active'
           AND r.user_status_version=s.user_status_version`,
        [enterpriseId, userId],
      )
    ).rows[0],
  );
}

export async function isEnterpriseOwner(sql: Sql, enterpriseId: string, userId: string) {
  return Boolean(
    (
      await sql.query(
        `SELECT 1
         FROM enterprise_role_assignments r
         JOIN identity_access_enterprise_scopes e
           ON e.account_id=r.enterprise_account_id
         JOIN identity_access_enterprise_subjects s
           ON s.enterprise_account_id=r.enterprise_account_id AND s.user_id=r.user_id
         WHERE r.enterprise_account_id=$1 AND r.user_id=$2
           AND e.status='active'
           AND r.role='EnterpriseOwner' AND r.status='active'
           AND s.affiliation_status='active' AND s.user_status='active'
           AND r.user_status_version=s.user_status_version`,
        [enterpriseId, userId],
      )
    ).rows[0],
  );
}

export async function hasReplacementEnterpriseOwner(
  sql: Sql,
  enterpriseId: string,
  excludedUserId: string,
) {
  return Boolean(
    (
      await sql.query(
        `SELECT 1
         FROM enterprise_role_assignments r
         JOIN identity_access_enterprise_subjects s
           ON s.enterprise_account_id=r.enterprise_account_id AND s.user_id=r.user_id
         WHERE r.enterprise_account_id=$1 AND r.user_id<>$2
           AND r.role='EnterpriseOwner' AND r.status='active'
           AND s.affiliation_status='active' AND s.user_status='active'
           AND r.user_status_version=s.user_status_version
         LIMIT 1`,
        [enterpriseId, excludedUserId],
      )
    ).rows[0],
  );
}

async function hasDirectOrganizationOwnerAssignment(
  sql: Sql,
  organizationAccountId: string,
  userId: string,
  requireActiveOrganization: boolean,
) {
  return Boolean(
    (
      await sql.query(
        `SELECT 1
         FROM organization_role_assignments r
         JOIN identity_access_organization_scopes o
           ON o.account_id=r.organization_account_id
         JOIN identity_access_organization_subjects s
           ON s.organization_account_id=r.organization_account_id AND s.user_id=r.user_id
         WHERE r.organization_account_id=$1 AND r.user_id=$2
           AND ($3::boolean=false OR o.status='active')
           AND r.role='OrganizationOwner' AND r.status='active'
           AND s.membership_status='active' AND s.user_status='active'
           AND r.user_status_version=s.user_status_version
           AND r.membership_version=s.membership_version`,
        [organizationAccountId, userId, requireActiveOrganization],
      )
    ).rows[0],
  );
}

export async function hasOrganizationOwnerAssignment(
  sql: Sql,
  organizationAccountId: string,
  userId: string,
) {
  return hasDirectOrganizationOwnerAssignment(sql, organizationAccountId, userId, false);
}

export async function isOrganizationOwner(sql: Sql, organizationAccountId: string, userId: string) {
  return hasDirectOrganizationOwnerAssignment(sql, organizationAccountId, userId, true);
}

export async function hasReplacementOrganizationOwner(
  sql: Sql,
  organizationAccountId: string,
  excludedUserId: string,
) {
  return Boolean(
    (
      await sql.query(
        `SELECT 1
         FROM organization_role_assignments r
         JOIN identity_access_organization_subjects s
           ON s.organization_account_id=r.organization_account_id AND s.user_id=r.user_id
         WHERE r.organization_account_id=$1 AND r.user_id<>$2
           AND r.role='OrganizationOwner' AND r.status='active'
           AND s.membership_status='active' AND s.user_status='active'
           AND r.user_status_version=s.user_status_version
           AND r.membership_version=s.membership_version
         LIMIT 1`,
        [organizationAccountId, excludedUserId],
      )
    ).rows[0],
  );
}

export async function readEnterpriseOwnerScopeIds(sql: Sql, userId: string): Promise<string[]> {
  const rows = (
    await sql.query(
      `SELECT r.enterprise_account_id AS id
       FROM enterprise_role_assignments r
       JOIN identity_access_enterprise_subjects s
         ON s.enterprise_account_id=r.enterprise_account_id AND s.user_id=r.user_id
       WHERE r.user_id=$1
         AND r.role='EnterpriseOwner' AND r.status='active'
         AND s.affiliation_status='active' AND s.user_status='active'
         AND r.user_status_version=s.user_status_version
       ORDER BY r.enterprise_account_id`,
      [userId],
    )
  ).rows as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

export async function readEnterpriseOwnerAssignments(
  sql: Sql,
  enterpriseId: string,
  userIds?: string[],
): Promise<Array<{ userId: string; version: number }>> {
  if (userIds && userIds.length === 0) return [];
  const rows = (
    await sql.query(
      `SELECT r.user_id AS "userId",r.version
       FROM enterprise_role_assignments r
       JOIN identity_access_enterprise_subjects s
         ON s.enterprise_account_id=r.enterprise_account_id AND s.user_id=r.user_id
       WHERE r.enterprise_account_id=$1
         AND r.role='EnterpriseOwner' AND r.status='active'
         AND s.affiliation_status='active' AND s.user_status='active'
         AND r.user_status_version=s.user_status_version
         AND ($2::text[] IS NULL OR r.user_id=ANY($2::text[]))
       ORDER BY r.user_id`,
      [enterpriseId, userIds ?? null],
    )
  ).rows as Array<{ userId: string; version: number }>;
  return rows.map((row) => ({ userId: row.userId, version: Number(row.version) }));
}

export async function readOrganizationOwnerScopeIds(sql: Sql, userId: string): Promise<string[]> {
  const rows = (
    await sql.query(
      `SELECT r.organization_account_id AS id
       FROM organization_role_assignments r
       JOIN identity_access_organization_subjects s
         ON s.organization_account_id=r.organization_account_id AND s.user_id=r.user_id
       WHERE r.user_id=$1
         AND r.role='OrganizationOwner' AND r.status='active'
         AND s.membership_status='active' AND s.user_status='active'
         AND r.user_status_version=s.user_status_version
         AND r.membership_version=s.membership_version
       ORDER BY r.organization_account_id`,
      [userId],
    )
  ).rows as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

export async function readOrganizationOwnerAssignments(
  sql: Sql,
  organizationAccountId: string,
  userIds?: string[],
): Promise<Array<{ userId: string; version: number }>> {
  if (userIds && userIds.length === 0) return [];
  const rows = (
    await sql.query(
      `SELECT r.user_id AS "userId",r.version
       FROM organization_role_assignments r
       JOIN identity_access_organization_subjects s
         ON s.organization_account_id=r.organization_account_id AND s.user_id=r.user_id
       WHERE r.organization_account_id=$1
         AND r.role='OrganizationOwner' AND r.status='active'
         AND s.membership_status='active' AND s.user_status='active'
         AND r.user_status_version=s.user_status_version
         AND r.membership_version=s.membership_version
         AND ($2::text[] IS NULL OR r.user_id=ANY($2::text[]))
       ORDER BY r.user_id`,
      [organizationAccountId, userIds ?? null],
    )
  ).rows as Array<{ userId: string; version: number }>;
  return rows.map((row) => ({ userId: row.userId, version: Number(row.version) }));
}

export async function requireEnterpriseOwner(sql: Sql, enterpriseId: string, userId: string) {
  if (!(await isEnterpriseOwner(sql, enterpriseId, userId))) {
    throw new GovernanceAccessError(403, "forbidden", "你沒有此 Enterprise 的 owner 權限。");
  }
}

export async function requireEnterpriseLifecycleOwner(
  sql: Sql,
  enterpriseId: string,
  userId: string,
) {
  if (!(await hasEnterpriseOwnerAssignment(sql, enterpriseId, userId))) {
    throw new GovernanceAccessError(403, "forbidden", "你沒有此 Enterprise 的治理權限。");
  }
}

export async function requireOrganizationOwner(
  sql: Sql,
  organizationAccountId: string,
  userId: string,
) {
  if (!(await isOrganizationOwner(sql, organizationAccountId, userId))) {
    throw new GovernanceAccessError(403, "forbidden", "你沒有此 Organization 的 owner 權限。");
  }
}

export async function requireOrganizationLifecycleOwner(
  sql: Sql,
  organizationAccountId: string,
  userId: string,
) {
  if (!(await hasOrganizationOwnerAssignment(sql, organizationAccountId, userId))) {
    throw new GovernanceAccessError(403, "forbidden", "你沒有此 Organization 的生命週期權限。");
  }
}

export async function revokeOrganizationOwnerForMembershipRemoval(
  sql: Sql,
  organizationAccountId: string,
  userId: string,
) {
  await sql.query(
    `UPDATE organization_role_assignments SET status='revoked',version=version+1
     WHERE organization_account_id=$1 AND user_id=$2
       AND role='OrganizationOwner' AND status='active'`,
    [organizationAccountId, userId],
  );
}

export async function revokeEnterpriseOwnerForAffiliationRemoval(
  sql: Sql,
  enterpriseAccountId: string,
  userId: string,
) {
  await sql.query(
    `UPDATE enterprise_role_assignments SET status='revoked',version=version+1
     WHERE enterprise_account_id=$1 AND user_id=$2
       AND role='EnterpriseOwner' AND status='active'`,
    [enterpriseAccountId, userId],
  );
}

export async function isTeamMaintainer(sql: Sql, teamId: string, userId: string) {
  return Boolean(
    (
      await sql.query(
        `SELECT 1
         FROM team_role_assignments r
         JOIN identity_access_team_subjects s
           ON s.team_id=r.team_id AND s.user_id=r.user_id
         WHERE r.team_id=$1 AND r.user_id=$2
           AND r.role='TeamMaintainer' AND r.status='active'
           AND s.team_membership_status='active'
           AND s.user_status='active'
           AND s.organization_status='active'
           AND s.organization_membership_status='active'
           AND r.user_status_version=s.user_status_version
           AND r.membership_version=s.team_membership_version`,
        [teamId, userId],
      )
    ).rows[0],
  );
}

export async function grantTeamMaintainer(
  sql: Sql,
  input: { teamId: string; targetUserId: string; userStatusVersion: number; now: number },
): Promise<void> {
  const target = await requireActiveTargetUser(sql, input.targetUserId);
  if (target.userStatusVersion !== input.userStatusVersion) {
    throw new GovernanceAccessError(409, "conflict", "使用者資格版本已更新。");
  }
  const membership = (
    await sql.query(
      `SELECT team_membership_version AS version
       FROM identity_access_team_subjects
       WHERE team_id=$1 AND user_id=$2
         AND team_membership_status='active'
         AND user_status='active'
         AND organization_status='active'
         AND organization_membership_status='active'`,
      [input.teamId, input.targetUserId],
    )
  ).rows[0];
  if (!membership) {
    throw new GovernanceAccessError(403, "forbidden", "TeamMaintainer 必須是有效 Team 成員。");
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
  input: { teamId: string; targetUserId: string; userStatusVersion: number; now: number },
): Promise<void> {
  const assignment = (
    await sql.query(
      `SELECT status,user_status_version FROM team_role_assignments
       WHERE team_id=$1 AND user_id=$2 AND role='TeamMaintainer' FOR UPDATE`,
      [input.teamId, input.targetUserId],
    )
  ).rows[0];
  if (!assignment) {
    throw new GovernanceAccessError(404, "not-found", "找不到 TeamMaintainer 指派。");
  }
  if (assignment.status !== "active") {
    throw new GovernanceAccessError(409, "invalid-transition", "TeamMaintainer 已撤銷。");
  }
  if (await isTeamMaintainer(sql, input.teamId, input.targetUserId)) {
    const replacement = (
      await sql.query(
        `SELECT 1
         FROM team_role_assignments r
         JOIN identity_access_team_subjects s
           ON s.team_id=r.team_id AND s.user_id=r.user_id
         WHERE r.team_id=$1 AND r.user_id<>$2
           AND r.role='TeamMaintainer' AND r.status='active'
           AND s.team_membership_status='active'
           AND s.user_status='active'
           AND s.organization_status='active'
           AND s.organization_membership_status='active'
           AND r.user_status_version=s.user_status_version
           AND r.membership_version=s.team_membership_version
         LIMIT 1`,
        [input.teamId, input.targetUserId],
      )
    ).rows[0];
    if (!replacement) {
      throw new GovernanceAccessError(
        409,
        "last-effective-role-holder",
        "不能撤銷最後一位有效 TeamMaintainer。",
      );
    }
  }
  await sql.query(
    `UPDATE team_role_assignments SET status='revoked',version=version+1
     WHERE team_id=$1 AND user_id=$2 AND role='TeamMaintainer'`,
    [input.teamId, input.targetUserId],
  );
  void input.now;
  void input.userStatusVersion;
}
