import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import type { Sql } from "@line_bot_v1/platform/postgres";
import type { OrganizationCommand } from "../contracts/organization-governance.js";

type OrganizationAdminCommand = Extract<
  OrganizationCommand,
  { action: "grant-organization-admin" | "revoke-organization-admin" }
>;

type AssignmentResult = Readonly<{ status: "active" | "revoked"; version: number }>;

export async function readOrganizationAdminAssignments(
  sql: Sql,
  organizationAccountId: string,
  userIds?: string[],
): Promise<Array<{ userId: string; version: number }>> {
  if (userIds && userIds.length === 0) return [];
  const rows = (
    await sql.query(
      `SELECT r.user_id AS "userId",r.version
       FROM organization_member_role_assignments r
       JOIN organization_memberships m
         ON m.organization_account_id=r.organization_account_id AND m.user_id=r.user_id
       JOIN users u ON u.id=r.user_id
       WHERE r.organization_account_id=$1
         AND r.role='ADMIN' AND r.status='active'
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

export async function mutateOrganizationAdminAssignment(
  sql: Sql,
  command: OrganizationAdminCommand,
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
      "Organization ADMIN 對象必須是有效 Organization member。",
    );
  }

  const assignment = (
    await sql.query(
      `SELECT status,version,user_status_version,membership_version
       FROM organization_member_role_assignments
       WHERE organization_account_id=$1 AND user_id=$2 AND role='ADMIN' FOR UPDATE`,
      [command.organizationAccountId, command.targetUserId],
    )
  ).rows[0];

  if (command.action === "grant-organization-admin") {
    const target = await readActiveUserQualification(sql, command.targetUserId, "share");
    if (!target) {
      throw new GovernanceAccessError(404, "not-found", "找不到有效對象使用者。");
    }
    const effectiveAssignment =
      assignment?.status === "active" &&
      assignment.user_status_version === target.statusVersion &&
      assignment.membership_version === membership.version;
    const effectiveVersion = effectiveAssignment ? Number(assignment.version) : 0;
    if (command.expectedVersion !== effectiveVersion) {
      throw new GovernanceAccessError(409, "conflict", "Organization ADMIN 指派版本已更新。");
    }
    if (effectiveAssignment) {
      throw new GovernanceAccessError(409, "invalid-transition", "Organization ADMIN 已生效。");
    }
    if (assignment) {
      const row = (
        await sql.query(
          `UPDATE organization_member_role_assignments
           SET status='active',version=version+1,user_status_version=$3,
             membership_version=$4,granted_at=$5
           WHERE organization_account_id=$1 AND user_id=$2 AND role='ADMIN'
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
      `INSERT INTO organization_member_role_assignments(
         organization_account_id,user_id,role,status,version,user_status_version,
         membership_version,granted_at
       ) VALUES($1,$2,'ADMIN','active',1,$3,$4,$5)`,
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
    throw new GovernanceAccessError(404, "not-found", "找不到 Organization ADMIN 指派。");
  }
  const target = await readActiveUserQualification(sql, command.targetUserId, "share");
  const effectiveAssignment =
    target !== null &&
    assignment.status === "active" &&
    assignment.user_status_version === target.statusVersion &&
    assignment.membership_version === membership.version;
  if (!effectiveAssignment) {
    throw new GovernanceAccessError(409, "invalid-transition", "Organization ADMIN 指派已失效。");
  }
  if (Number(assignment.version) !== command.expectedVersion) {
    throw new GovernanceAccessError(409, "conflict", "Organization ADMIN 指派版本已更新。");
  }
  const row = (
    await sql.query(
      `UPDATE organization_member_role_assignments
       SET status='revoked',version=version+1
       WHERE organization_account_id=$1 AND user_id=$2 AND role='ADMIN'
       RETURNING version`,
      [command.organizationAccountId, command.targetUserId],
    )
  ).rows[0]!;
  return { status: "revoked", version: Number(row.version) };
}
