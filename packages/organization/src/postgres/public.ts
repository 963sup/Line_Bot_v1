import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { resolveAccountLogin } from "@line_bot_v1/namespace/postgres";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import type {
  OrganizationPublicStore,
  OrganizationViewerCapabilities,
  PublicOrganization,
} from "../contracts/output/public.js";

export class PostgresOrganizationPublicStore implements OrganizationPublicStore {
  constructor(private db: Database = businessDatabase()) {}

  byLogin(login: string): Promise<PublicOrganization | null> {
    return this.db.transaction(async (sql) => {
      const owner = await resolveAccountLogin(sql, login);
      if (!owner || owner.kind !== "ORGANIZATION") return null;
      const row = (
        await sql.query(
          `SELECT account_id AS id,name
           FROM organizations
           WHERE account_id=$1 AND status='active'`,
          [owner.id],
        )
      ).rows[0] as { id: string; name: string } | undefined;
      return row ? { ...row, login: owner.login } : null;
    });
  }
}

export async function readOrganizationViewerCapabilities(
  sql: Sql,
  userId: string,
  organizationAccountId: string,
): Promise<OrganizationViewerCapabilities | null> {
  const user = await readActiveUserQualification(sql, userId, "share");
  if (!user) return null;

  const row = (
    await sql.query(
      `SELECT o.version AS organization_version,m.version AS membership_version,
              owner_role.version AS owner_role_version,
              admin_role.version AS admin_role_version
       FROM organizations o
       JOIN organization_memberships m
         ON m.organization_account_id=o.account_id
        AND m.user_id=$2
        AND m.status='active'
       LEFT JOIN LATERAL (
         SELECT r.version
         FROM organization_role_assignments r
         WHERE r.organization_account_id=o.account_id
           AND r.user_id=$2
           AND r.role='OrganizationOwner'
           AND r.status='active'
           AND r.user_status_version=$3
           AND r.membership_version=m.version
         LIMIT 1
       ) owner_role ON true
       LEFT JOIN LATERAL (
         SELECT r.version
         FROM organization_member_role_assignments r
         WHERE r.organization_account_id=o.account_id
           AND r.user_id=$2
           AND r.role='ADMIN'
           AND r.status='active'
           AND r.user_status_version=$3
           AND r.membership_version=m.version
         LIMIT 1
       ) admin_role ON true
       WHERE o.account_id=$1 AND o.status='active'`,
      [organizationAccountId, userId, user.statusVersion],
    )
  ).rows[0] as
    | {
        organization_version: number;
        membership_version: number;
        owner_role_version: number | null;
        admin_role_version: number | null;
      }
    | undefined;
  if (!row) return null;

  const isOrganizationOwner = row.owner_role_version !== null;
  const memberRole = isOrganizationOwner || row.admin_role_version !== null ? "ADMIN" : "MEMBER";
  const viewerCanAdminister = memberRole === "ADMIN";
  return {
    memberRole,
    isOrganizationOwner,
    viewerIsAMember: true,
    viewerCanAdminister,
    viewerCanCreateRepositories: viewerCanAdminister,
    viewerCanCreateProjects: viewerCanAdminister,
    viewerCanCreateTeams: true,
    organizationVersion: Number(row.organization_version),
    membershipVersion: Number(row.membership_version),
    roleVersion: isOrganizationOwner
      ? Number(row.owner_role_version)
      : row.admin_role_version === null
        ? null
        : Number(row.admin_role_version),
  };
}

async function activeOrganizationIds(sql: Sql, userId: string): Promise<string[]> {
  const rows = (
    await sql.query(
      `SELECT o.account_id
       FROM organizations o
       JOIN organization_memberships m
         ON m.organization_account_id=o.account_id AND m.user_id=$1
       WHERE o.status='active' AND m.status='active'
       ORDER BY o.account_id`,
      [userId],
    )
  ).rows as Array<{ account_id: string }>;
  return rows.map((row) => row.account_id);
}

export async function listOrganizationAdministrationScopeIds(
  sql: Sql,
  userId: string,
): Promise<string[]> {
  const result: string[] = [];
  for (const organizationAccountId of await activeOrganizationIds(sql, userId)) {
    const capabilities = await readOrganizationViewerCapabilities(
      sql,
      userId,
      organizationAccountId,
    );
    if (capabilities?.viewerCanAdminister) result.push(organizationAccountId);
  }
  return result;
}

export async function listOrganizationRepositoryCreationScopeIds(
  sql: Sql,
  userId: string,
): Promise<string[]> {
  const result: string[] = [];
  for (const organizationAccountId of await activeOrganizationIds(sql, userId)) {
    const capabilities = await readOrganizationViewerCapabilities(
      sql,
      userId,
      organizationAccountId,
    );
    if (capabilities?.viewerCanCreateRepositories) result.push(organizationAccountId);
  }
  return result;
}
