import type { Sql } from "@line_bot_v1/platform/postgres";
import { numberValue, stringValue } from "@line_bot_v1/platform/validation";

function idRow(row: Record<string, unknown>) {
  return { id: stringValue(row.id) };
}

function ownerAssignmentRow(row: Record<string, unknown>) {
  return { userId: stringValue(row.userId), version: numberValue(row.version) };
}

export async function hasEnterpriseOwnerAssignment(
  sql: Sql,
  enterpriseAccountId: string,
  userId: string,
) {
  return Boolean(
    (
      await sql.query(
        `SELECT 1
         FROM enterprise_role_assignments r
         JOIN enterprise_direct_affiliations a
           ON a.enterprise_account_id=r.enterprise_account_id AND a.user_id=r.user_id
         JOIN identity_access_enterprise_subjects u
           ON u.enterprise_account_id=r.enterprise_account_id AND u.user_id=r.user_id
         WHERE r.enterprise_account_id=$1 AND r.user_id=$2
           AND r.role='EnterpriseOwner' AND r.status='active'
           AND a.status='active' AND u.user_status='active'
           AND r.user_status_version=u.user_status_version`,
        [enterpriseAccountId, userId],
      )
    ).rows[0],
  );
}

export async function hasReplacementEnterpriseOwner(
  sql: Sql,
  enterpriseAccountId: string,
  excludedUserId: string,
) {
  return Boolean(
    (
      await sql.query(
        `SELECT 1
         FROM enterprise_role_assignments r
         JOIN enterprise_direct_affiliations a
           ON a.enterprise_account_id=r.enterprise_account_id AND a.user_id=r.user_id
         JOIN identity_access_enterprise_subjects u
           ON u.enterprise_account_id=r.enterprise_account_id AND u.user_id=r.user_id
         WHERE r.enterprise_account_id=$1 AND r.user_id<>$2
           AND r.role='EnterpriseOwner' AND r.status='active'
           AND a.status='active' AND u.user_status='active'
           AND r.user_status_version=u.user_status_version
         LIMIT 1`,
        [enterpriseAccountId, excludedUserId],
      )
    ).rows[0],
  );
}

export async function readEnterpriseOwnerScopeIds(sql: Sql, userId: string): Promise<string[]> {
  const rows = (
    await sql.query(
      `SELECT r.enterprise_account_id AS id
       FROM enterprise_role_assignments r
       JOIN enterprise_direct_affiliations a
         ON a.enterprise_account_id=r.enterprise_account_id AND a.user_id=r.user_id
       JOIN identity_access_enterprise_subjects u
         ON u.enterprise_account_id=r.enterprise_account_id AND u.user_id=r.user_id
       WHERE r.user_id=$1
         AND r.role='EnterpriseOwner' AND r.status='active'
         AND a.status='active' AND u.user_status='active'
         AND r.user_status_version=u.user_status_version
      ORDER BY r.enterprise_account_id`,
      [userId],
      idRow,
    )
  ).rows;
  return rows.map((row) => row.id);
}

export async function readEnterpriseOwnerAssignments(
  sql: Sql,
  enterpriseAccountId: string,
  userIds?: string[],
): Promise<Array<{ userId: string; version: number }>> {
  if (userIds && userIds.length === 0) return [];
  const rows = (
    await sql.query(
      `SELECT r.user_id AS "userId",r.version
       FROM enterprise_role_assignments r
       JOIN enterprise_direct_affiliations a
         ON a.enterprise_account_id=r.enterprise_account_id AND a.user_id=r.user_id
       JOIN identity_access_enterprise_subjects u
         ON u.enterprise_account_id=r.enterprise_account_id AND u.user_id=r.user_id
       WHERE r.enterprise_account_id=$1
         AND r.role='EnterpriseOwner' AND r.status='active'
         AND a.status='active' AND u.user_status='active'
         AND r.user_status_version=u.user_status_version
         AND ($2::text[] IS NULL OR r.user_id=ANY($2::text[]))
      ORDER BY r.user_id`,
      [enterpriseAccountId, userIds ?? null],
      ownerAssignmentRow,
    )
  ).rows;
  return rows.map((row) => ({ userId: row.userId, version: Number(row.version) }));
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
