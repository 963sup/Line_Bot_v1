import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import type { Sql } from "@line_bot_v1/platform/postgres";
import type { EnterpriseCommand } from "../contracts/enterprise-governance.js";

type EnterpriseOwnerCommand = Extract<
  EnterpriseCommand,
  { action: "grant-enterprise-owner" | "revoke-enterprise-owner" }
>;

type AssignmentResult = Readonly<{ status: "active" | "revoked"; version: number }>;

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
         JOIN users u ON u.id=r.user_id
         WHERE r.enterprise_account_id=$1 AND r.user_id=$2
           AND r.role='EnterpriseOwner' AND r.status='active'
           AND a.status='active' AND u.status='active'
           AND r.user_status_version=u.status_version`,
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
         JOIN users u ON u.id=r.user_id
         WHERE r.enterprise_account_id=$1 AND r.user_id<>$2
           AND r.role='EnterpriseOwner' AND r.status='active'
           AND a.status='active' AND u.status='active'
           AND r.user_status_version=u.status_version
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
       JOIN users u ON u.id=r.user_id
       WHERE r.user_id=$1
         AND r.role='EnterpriseOwner' AND r.status='active'
         AND a.status='active' AND u.status='active'
         AND r.user_status_version=u.status_version
       ORDER BY r.enterprise_account_id`,
      [userId],
    )
  ).rows as Array<{ id: string }>;
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
       JOIN users u ON u.id=r.user_id
       WHERE r.enterprise_account_id=$1
         AND r.role='EnterpriseOwner' AND r.status='active'
         AND a.status='active' AND u.status='active'
         AND r.user_status_version=u.status_version
         AND ($2::text[] IS NULL OR r.user_id=ANY($2::text[]))
       ORDER BY r.user_id`,
      [enterpriseAccountId, userIds ?? null],
    )
  ).rows as Array<{ userId: string; version: number }>;
  return rows.map((row) => ({ userId: row.userId, version: Number(row.version) }));
}

export async function mutateEnterpriseOwnerAssignment(
  sql: Sql,
  command: EnterpriseOwnerCommand,
  now: number,
): Promise<AssignmentResult> {
  const direct = (
    await sql.query(
      `SELECT 1 FROM enterprise_direct_affiliations
       WHERE enterprise_account_id=$1 AND user_id=$2 AND status='active'`,
      [command.enterpriseAccountId, command.targetUserId],
    )
  ).rows[0];
  if (!direct) {
    throw new GovernanceAccessError(
      403,
      "forbidden",
      "EnterpriseOwner 對象必須有 active direct Enterprise affiliation。",
    );
  }

  const target = await readActiveUserQualification(sql, command.targetUserId, "share");
  if (!target) {
    throw new GovernanceAccessError(404, "not-found", "找不到有效對象使用者。");
  }

  const assignment = (
    await sql.query(
      `SELECT status,version,user_status_version FROM enterprise_role_assignments
       WHERE enterprise_account_id=$1 AND user_id=$2 AND role='EnterpriseOwner' FOR UPDATE`,
      [command.enterpriseAccountId, command.targetUserId],
    )
  ).rows[0];

  if (command.action === "grant-enterprise-owner") {
    if (
      (!assignment && command.expectedVersion !== 0) ||
      (assignment && assignment.version !== command.expectedVersion)
    ) {
      throw new GovernanceAccessError(409, "conflict", "EnterpriseOwner 指派版本已更新。");
    }
    if (
      assignment?.status === "active" &&
      assignment.user_status_version === target.statusVersion
    ) {
      throw new GovernanceAccessError(409, "invalid-transition", "EnterpriseOwner 已生效。");
    }
    if (assignment) {
      const row = (
        await sql.query(
          `UPDATE enterprise_role_assignments
           SET status='active',version=version+1,user_status_version=$3,granted_at=$4
           WHERE enterprise_account_id=$1 AND user_id=$2 AND role='EnterpriseOwner'
           RETURNING version`,
          [command.enterpriseAccountId, command.targetUserId, target.statusVersion, now],
        )
      ).rows[0]!;
      return { status: "active", version: Number(row.version) };
    }
    await sql.query(
      `INSERT INTO enterprise_role_assignments(
         enterprise_account_id,user_id,role,status,version,user_status_version,granted_at
       ) VALUES($1,$2,'EnterpriseOwner','active',1,$3,$4)`,
      [command.enterpriseAccountId, command.targetUserId, target.statusVersion, now],
    );
    return { status: "active", version: 1 };
  }

  if (!assignment) {
    throw new GovernanceAccessError(404, "not-found", "找不到 EnterpriseOwner 指派。");
  }
  if (assignment.version !== command.expectedVersion) {
    throw new GovernanceAccessError(409, "conflict", "EnterpriseOwner 指派版本已更新。");
  }
  if (assignment.status !== "active") {
    throw new GovernanceAccessError(409, "invalid-transition", "EnterpriseOwner 已撤銷。");
  }
  if (
    (await hasEnterpriseOwnerAssignment(sql, command.enterpriseAccountId, command.targetUserId)) &&
    !(await hasReplacementEnterpriseOwner(sql, command.enterpriseAccountId, command.targetUserId))
  ) {
    throw new GovernanceAccessError(
      409,
      "last-effective-role-holder",
      "不能撤銷最後一位有效 EnterpriseOwner。",
    );
  }
  const row = (
    await sql.query(
      `UPDATE enterprise_role_assignments SET status='revoked',version=version+1
       WHERE enterprise_account_id=$1 AND user_id=$2 AND role='EnterpriseOwner'
       RETURNING version`,
      [command.enterpriseAccountId, command.targetUserId],
    )
  ).rows[0]!;
  return { status: "revoked", version: Number(row.version) };
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
