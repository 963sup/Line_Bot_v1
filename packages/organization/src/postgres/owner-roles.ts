import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import type { Sql } from "@line_bot_v1/platform/postgres";
import type { OrganizationCommand } from "../contracts/organization-governance.js";

type OrganizationOwnerCommand = Extract<
  OrganizationCommand,
  { action: "grant-organization-owner" | "revoke-organization-owner" }
>;

type AssignmentResult = Readonly<{ status: "active" | "revoked"; version: number }>;

export async function hasOrganizationOwnerAssignment(
  sql: Sql,
  organizationAccountId: string,
  userId: string,
) {
  return Boolean(
    (
      await sql.query(
        `SELECT 1
         FROM organization_role_assignments r
         JOIN organization_memberships m
           ON m.organization_account_id=r.organization_account_id AND m.user_id=r.user_id
         JOIN users u ON u.id=r.user_id
         WHERE r.organization_account_id=$1 AND r.user_id=$2
           AND r.role='OrganizationOwner' AND r.status='active'
           AND m.status='active' AND u.status='active'
           AND r.user_status_version=u.status_version
           AND r.membership_version=m.version`,
        [organizationAccountId, userId],
      )
    ).rows[0],
  );
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
         JOIN organization_memberships m
           ON m.organization_account_id=r.organization_account_id AND m.user_id=r.user_id
         JOIN users u ON u.id=r.user_id
         WHERE r.organization_account_id=$1 AND r.user_id<>$2
           AND r.role='OrganizationOwner' AND r.status='active'
           AND m.status='active' AND u.status='active'
           AND r.user_status_version=u.status_version
           AND r.membership_version=m.version
         LIMIT 1`,
        [organizationAccountId, excludedUserId],
      )
    ).rows[0],
  );
}

export async function readOrganizationOwnerScopeIds(sql: Sql, userId: string): Promise<string[]> {
  const rows = (
    await sql.query(
      `SELECT r.organization_account_id AS id
       FROM organization_role_assignments r
       JOIN organization_memberships m
         ON m.organization_account_id=r.organization_account_id AND m.user_id=r.user_id
       JOIN users u ON u.id=r.user_id
       WHERE r.user_id=$1
         AND r.role='OrganizationOwner' AND r.status='active'
         AND m.status='active' AND u.status='active'
         AND r.user_status_version=u.status_version
         AND r.membership_version=m.version
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
       JOIN organization_memberships m
         ON m.organization_account_id=r.organization_account_id AND m.user_id=r.user_id
       JOIN users u ON u.id=r.user_id
       WHERE r.organization_account_id=$1
         AND r.role='OrganizationOwner' AND r.status='active'
         AND m.status='active' AND u.status='active'
         AND r.user_status_version=u.status_version
         AND r.membership_version=m.version
         AND ($2::text[] IS NULL OR r.user_id=ANY($2::text[]))
       ORDER BY r.user_id`,
      [organizationAccountId, userIds ?? null],
    )
  ).rows as Array<{ userId: string; version: number }>;
  return rows.map((row) => ({ userId: row.userId, version: Number(row.version) }));
}

export async function mutateOrganizationOwnerAssignment(
  sql: Sql,
  command: OrganizationOwnerCommand,
  now: number,
): Promise<AssignmentResult> {
  const membership = (
    await sql.query(
      `SELECT status,version FROM organization_memberships
       WHERE organization_account_id=$1 AND user_id=$2`,
      [command.organizationAccountId, command.targetUserId],
    )
  ).rows[0];
  if (!membership || membership.status !== "active") {
    throw new GovernanceAccessError(
      403,
      "forbidden",
      "OrganizationOwner 對象必須是有效 Organization member。",
    );
  }

  const assignment = (
    await sql.query(
      `SELECT status,version,user_status_version,membership_version
       FROM organization_role_assignments
       WHERE organization_account_id=$1 AND user_id=$2 AND role='OrganizationOwner' FOR UPDATE`,
      [command.organizationAccountId, command.targetUserId],
    )
  ).rows[0];

  if (command.action === "grant-organization-owner") {
    const target = await readActiveUserQualification(sql, command.targetUserId, "share");
    if (!target) {
      throw new GovernanceAccessError(404, "not-found", "找不到有效對象使用者。");
    }
    if (
      (!assignment && command.expectedVersion !== 0) ||
      (assignment && assignment.version !== command.expectedVersion)
    ) {
      throw new GovernanceAccessError(409, "conflict", "OrganizationOwner 指派版本已更新。");
    }
    if (
      assignment?.status === "active" &&
      assignment.user_status_version === target.statusVersion &&
      assignment.membership_version === membership.version
    ) {
      throw new GovernanceAccessError(409, "invalid-transition", "OrganizationOwner 已生效。");
    }
    if (assignment) {
      const row = (
        await sql.query(
          `UPDATE organization_role_assignments
           SET status='active',version=version+1,user_status_version=$3,
             membership_version=$4,granted_at=$5
           WHERE organization_account_id=$1 AND user_id=$2 AND role='OrganizationOwner'
           RETURNING version`,
          [
            command.organizationAccountId,
            command.targetUserId,
            target.statusVersion,
            membership.version,
            now,
          ],
        )
      ).rows[0]!;
      return { status: "active", version: Number(row.version) };
    }
    await sql.query(
      `INSERT INTO organization_role_assignments(
         organization_account_id,user_id,role,status,version,user_status_version,
         membership_version,granted_at
       ) VALUES($1,$2,'OrganizationOwner','active',1,$3,$4,$5)`,
      [
        command.organizationAccountId,
        command.targetUserId,
        target.statusVersion,
        membership.version,
        now,
      ],
    );
    return { status: "active", version: 1 };
  }

  if (!assignment) {
    throw new GovernanceAccessError(404, "not-found", "找不到 OrganizationOwner 指派。");
  }
  if (assignment.version !== command.expectedVersion) {
    throw new GovernanceAccessError(409, "conflict", "OrganizationOwner 指派版本已更新。");
  }
  if (assignment.status !== "active") {
    throw new GovernanceAccessError(409, "invalid-transition", "OrganizationOwner 已撤銷。");
  }
  if (
    (await hasOrganizationOwnerAssignment(
      sql,
      command.organizationAccountId,
      command.targetUserId,
    )) &&
    !(await hasReplacementOrganizationOwner(
      sql,
      command.organizationAccountId,
      command.targetUserId,
    ))
  ) {
    throw new GovernanceAccessError(
      409,
      "last-effective-role-holder",
      "不能撤銷最後一位有效 OrganizationOwner。",
    );
  }

  const row = (
    await sql.query(
      `UPDATE organization_role_assignments SET status='revoked',version=version+1
       WHERE organization_account_id=$1 AND user_id=$2 AND role='OrganizationOwner'
       RETURNING version`,
      [command.organizationAccountId, command.targetUserId],
    )
  ).rows[0]!;
  return { status: "revoked", version: Number(row.version) };
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
