import {
  readAccountLogin,
  readActiveUserQualification,
} from "@line-work/account/adapters/postgres";
import { resolveVerifiedLineActor } from "@line-work/identity-access/adapters/postgres";
import type { VerifiedLineActor } from "@line-work/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line-work/identity-access/domain/role-assignment";
import type { Sql } from "@line-work/platform/adapters/postgres";

export type OrganizationTeamQualification = Readonly<{
  userId: string;
  userStatusVersion: number;
  organizationVersion: number;
  membershipVersion: number;
  organizationLogin: string;
}>;

export type OrganizationQualification = Readonly<{
  id: string;
  status: "active" | "inactive";
  version: number;
}>;

export async function readOrganizationQualification(
  sql: Sql,
  organizationAccountId: string,
  lock: "none" | "share" | "update" = "none",
): Promise<OrganizationQualification | null> {
  const suffix = lock === "share" ? " FOR SHARE" : lock === "update" ? " FOR UPDATE" : "";
  const row = (
    await sql.query(
      `SELECT account_id,status,version FROM organizations
       WHERE account_id=$1${suffix}`,
      [organizationAccountId],
    )
  ).rows[0] as { account_id: string; status: "active" | "inactive"; version: number } | undefined;
  return row ? { id: row.account_id, status: row.status, version: Number(row.version) } : null;
}

export async function listOrganizationTeamScopes(
  sql: Sql,
  actor: VerifiedLineActor,
): Promise<Array<{ organizationAccountId: string; login: string }>> {
  const resolved = await resolveVerifiedLineActor(sql, actor);
  const rows = (
    await sql.query(
      `SELECT o.account_id AS "organizationAccountId"
       FROM organizations o
       JOIN organization_memberships m ON m.organization_account_id=o.account_id
       WHERE m.user_id=$1 AND o.status='active' AND m.status='active'
       ORDER BY o.account_id`,
      [resolved.userId],
    )
  ).rows as Array<{ organizationAccountId: string }>;
  const result: Array<{ organizationAccountId: string; login: string }> = [];
  for (const row of rows) {
    const locator = await readAccountLogin(sql, row.organizationAccountId, "ORGANIZATION");
    if (locator) result.push({ ...row, login: locator.login });
  }
  return result;
}

export async function activeOrganizationParticipantIds(
  sql: Sql,
  organizationAccountId: string,
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = (
    await sql.query(
      `SELECT m.user_id FROM organizations o
       JOIN organization_memberships m ON m.organization_account_id=o.account_id
       WHERE o.account_id=$1 AND m.user_id=ANY($2::text[])
         AND o.status='active' AND m.status='active'
       ORDER BY m.user_id`,
      [organizationAccountId, [...new Set(userIds)].sort()],
    )
  ).rows as Array<{ user_id: string }>;
  const active = new Set<string>();
  for (const row of rows) {
    if (await readActiveUserQualification(sql, row.user_id, "share")) active.add(row.user_id);
  }
  return active;
}

export async function qualifyOrganizationTeamScope(
  sql: Sql,
  actor: VerifiedLineActor,
  organizationAccountId: string,
): Promise<OrganizationTeamQualification> {
  const resolved = await resolveVerifiedLineActor(sql, actor);
  const row = (
    await sql.query(
      `SELECT o.version AS organization_version,m.version AS membership_version
       FROM organizations o
       JOIN organization_memberships m ON m.organization_account_id=o.account_id
       WHERE o.account_id=$1 AND m.user_id=$2
         AND o.status='active' AND m.status='active'
       FOR SHARE OF o,m`,
      [organizationAccountId, resolved.userId],
    )
  ).rows[0];
  if (!row) {
    throw new GovernanceAccessError(403, "forbidden", "你不是此 Organization 的有效成員。");
  }
  const locator = await readAccountLogin(sql, organizationAccountId, "ORGANIZATION");
  if (!locator) {
    throw new GovernanceAccessError(409, "scope-conflict", "Organization login 不可用。");
  }
  return {
    ...resolved,
    organizationVersion: Number(row.organization_version),
    membershipVersion: Number(row.membership_version),
    organizationLogin: locator.login,
  };
}
