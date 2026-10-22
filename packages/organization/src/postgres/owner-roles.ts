import type { Sql } from "@line_bot_v1/platform/postgres";
import { numberValue, stringValue } from "@line_bot_v1/platform/validation";

function idRow(row: Record<string, unknown>) {
  return { id: stringValue(row.id) };
}

function ownerAssignmentRow(row: Record<string, unknown>) {
  return { userId: stringValue(row.userId), version: numberValue(row.version) };
}

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
         JOIN identity_access_organization_subjects u
           ON u.organization_account_id=r.organization_account_id AND u.user_id=r.user_id
         WHERE r.organization_account_id=$1 AND r.user_id=$2
           AND r.role='OrganizationOwner' AND r.status='active'
           AND m.status='active' AND u.user_status='active'
           AND r.user_status_version=u.user_status_version
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
  removal?: {
    affectedUserIds: readonly string[];
    sourceKind: "direct" | "enterprise-team";
    sourceId: string;
  },
) {
  return Boolean(
    (
      await sql.query(
        `SELECT 1
         FROM organization_role_assignments r
         JOIN organization_memberships m
           ON m.organization_account_id=r.organization_account_id AND m.user_id=r.user_id
         JOIN identity_access_organization_subjects u
           ON u.organization_account_id=r.organization_account_id AND u.user_id=r.user_id
         WHERE r.organization_account_id=$1 AND r.user_id<>$2
           AND r.role='OrganizationOwner' AND r.status='active'
           AND m.status='active' AND u.user_status='active'
           AND r.user_status_version=u.user_status_version
           AND r.membership_version=m.version
           AND ($3::text[] IS NULL OR NOT (r.user_id=ANY($3::text[])) OR EXISTS (
             SELECT 1 FROM organization_membership_sources s
             WHERE s.organization_account_id=r.organization_account_id AND s.user_id=r.user_id
               AND NOT (s.source_kind=$4 AND s.source_id=$5)
           ))
         LIMIT 1`,
        [
          organizationAccountId,
          excludedUserId,
          removal?.affectedUserIds ?? null,
          removal?.sourceKind ?? null,
          removal?.sourceId ?? null,
        ],
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
       JOIN identity_access_organization_subjects u
         ON u.organization_account_id=r.organization_account_id AND u.user_id=r.user_id
       WHERE r.user_id=$1
         AND r.role='OrganizationOwner' AND r.status='active'
         AND m.status='active' AND u.user_status='active'
         AND r.user_status_version=u.user_status_version
         AND r.membership_version=m.version
      ORDER BY r.organization_account_id`,
      [userId],
      idRow,
    )
  ).rows;
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
       JOIN identity_access_organization_subjects u
         ON u.organization_account_id=r.organization_account_id AND u.user_id=r.user_id
       WHERE r.organization_account_id=$1
         AND r.role='OrganizationOwner' AND r.status='active'
         AND m.status='active' AND u.user_status='active'
         AND r.user_status_version=u.user_status_version
         AND r.membership_version=m.version
         AND ($2::text[] IS NULL OR r.user_id=ANY($2::text[]))
      ORDER BY r.user_id`,
      [organizationAccountId, userIds ?? null],
      ownerAssignmentRow,
    )
  ).rows;
  return rows.map((row) => ({ userId: row.userId, version: Number(row.version) }));
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
