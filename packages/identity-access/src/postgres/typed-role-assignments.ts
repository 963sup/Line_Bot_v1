import type { Sql } from "@line_bot_v1/platform/postgres";
import { GovernanceAccessError } from "../domain/role-assignment.js";

async function hasEnterpriseOwnerAssignment(sql: Sql, enterpriseId: string, userId: string) {
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

async function isEnterpriseOwner(sql: Sql, enterpriseId: string, userId: string) {
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
