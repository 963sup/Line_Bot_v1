import type { Sql } from "@line_bot_v1/platform/postgres";
import { GovernanceAccessError } from "../domain/role-assignment.js";

export async function hasEnterpriseOwnerAssignment(sql: Sql, enterpriseId: string, userId: string) {
  return Boolean(
    (
      await sql.query(
        `SELECT 1
         FROM identity_access_enterprise_subjects s
         WHERE s.enterprise_account_id=$1 AND s.user_id=$2
           AND s.owner_assignment_qualified`,
        [enterpriseId, userId],
      )
    ).rows[0],
  );
}

async function isEnterpriseOwner(sql: Sql, enterpriseId: string, userId: string) {
  return Boolean(
    (
      await sql.query(
        `SELECT 1
         FROM identity_access_enterprise_scopes e
         JOIN identity_access_enterprise_subjects s
           ON s.enterprise_account_id=e.account_id
         WHERE e.account_id=$1 AND s.user_id=$2
           AND e.status='active'
           AND s.owner_assignment_qualified`,
        [enterpriseId, userId],
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
         FROM identity_access_organization_scopes o
         JOIN identity_access_organization_subjects s
           ON s.organization_account_id=o.account_id
         WHERE o.account_id=$1 AND s.user_id=$2
           AND ($3::boolean=false OR o.status='active')
           AND s.owner_assignment_qualified`,
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
