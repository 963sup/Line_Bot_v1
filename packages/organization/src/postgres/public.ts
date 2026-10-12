import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { resolveAccountLogin } from "@line_bot_v1/namespace/postgres";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import {
  booleanValue,
  nullableNumericValue,
  numberValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import type {
  OrganizationPublicStore,
  OrganizationViewerCapabilities,
  PublicOrganization,
} from "../contracts/output/public.js";

function publicOrganizationRow(row: Record<string, unknown>) {
  return { id: stringValue(row.id), name: stringValue(row.name) };
}

function viewerCapabilitiesRow(row: Record<string, unknown>) {
  return {
    organization_version: numberValue(row.organization_version),
    membership_version: numberValue(row.membership_version),
    owner_role_version: nullableNumericValue(row.owner_role_version),
    member_can_create_public_repositories: booleanValue(row.member_can_create_public_repositories),
    member_can_create_private_repositories: booleanValue(
      row.member_can_create_private_repositories,
    ),
    member_can_create_internal_repositories: booleanValue(
      row.member_can_create_internal_repositories,
    ),
    member_can_create_project_v2: booleanValue(row.member_can_create_project_v2),
    member_can_create_teams: booleanValue(row.member_can_create_teams),
  };
}

function accountIdRow(row: Record<string, unknown>) {
  return { account_id: stringValue(row.account_id) };
}

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
          publicOrganizationRow,
        )
      ).rows[0];
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
              o.member_can_create_public_repositories,
              o.member_can_create_private_repositories,
              o.member_can_create_internal_repositories,
              o.member_can_create_project_v2,
              o.member_can_create_teams,
              owner_role.version AS owner_role_version
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
      WHERE o.account_id=$1 AND o.status='active'`,
      [organizationAccountId, userId, user.statusVersion],
      viewerCapabilitiesRow,
    )
  ).rows[0];
  if (!row) return null;

  const isOrganizationOwner = row.owner_role_version !== null;
  const memberRole = isOrganizationOwner ? "ADMIN" : "MEMBER";
  const viewerCanAdminister = isOrganizationOwner;
  const viewerCanCreateRepositoryVisibilities = {
    public: isOrganizationOwner || row.member_can_create_public_repositories,
    private: isOrganizationOwner || row.member_can_create_private_repositories,
    internal: isOrganizationOwner || row.member_can_create_internal_repositories,
  };
  return {
    memberRole,
    isOrganizationOwner,
    viewerIsAMember: true,
    viewerCanAdminister,
    viewerCanCreateRepositories: Object.values(viewerCanCreateRepositoryVisibilities).some(Boolean),
    viewerCanCreateRepositoryVisibilities,
    viewerCanCreateProjectV2: isOrganizationOwner || row.member_can_create_project_v2,
    viewerCanCreateTeams: isOrganizationOwner || row.member_can_create_teams,
    organizationVersion: Number(row.organization_version),
    membershipVersion: Number(row.membership_version),
    roleVersion: isOrganizationOwner ? Number(row.owner_role_version) : null,
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
      accountIdRow,
    )
  ).rows;
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
