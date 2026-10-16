import type {
  GovernanceQuery,
  VerifiedLineActor,
} from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { resolveVerifiedLineActor } from "@line_bot_v1/identity-access/postgres";
import { readAccountLogin } from "@line_bot_v1/namespace/postgres";
import type { Database } from "@line_bot_v1/platform/postgres";
import {
  booleanValue,
  literalValue,
  nullableNumericValue,
  numberValue,
  record,
  stringValue,
} from "@line_bot_v1/platform/validation";
import type {
  OrganizationDetail,
  OrganizationInvitationProjection,
  OrganizationList,
  OrganizationMembershipProjection,
  OrganizationMembershipSource,
} from "../../../contracts/organization-governance.js";
import {
  hasOrganizationOwnerAssignment,
  readOrganizationOwnerAssignments,
  readOrganizationOwnerScopeIds,
} from "../../../postgres/owner-roles.js";
import { readOrganizationViewerCapabilities } from "../../../postgres/public.js";

function nullableNumber(value: unknown): number | null {
  const numeric = nullableNumericValue(value);
  return numeric === null ? null : Number(numeric);
}

function organizationListRow(row: Record<string, unknown>) {
  return {
    id: stringValue(row.id),
    name: stringValue(row.name),
    status: literalValue(row.status, ["active", "inactive"]),
    version: numberValue(row.version),
    membership_status:
      row.membership_status === null
        ? null
        : literalValue(row.membership_status, ["active", "removed"]),
    direct_membership_version: nullableNumber(row.direct_membership_version),
    invitation_status:
      row.invitation_status === null
        ? null
        : literalValue(row.invitation_status, ["pending", "accepted", "cancelled", "declined"]),
    invitation_version: nullableNumber(row.invitation_version),
  };
}

function organizationDetailRow(row: Record<string, unknown>) {
  return {
    ...organizationListRow(row),
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

function organizationMemberRow(row: Record<string, unknown>) {
  return {
    user_id: stringValue(row.user_id),
    status: literalValue(row.status, ["active", "removed"]),
    version: numberValue(row.version),
    sources: row.sources,
    direct_membership_version: nullableNumber(row.direct_membership_version),
  };
}

function organizationInvitationRow(row: Record<string, unknown>) {
  return {
    user_id: stringValue(row.user_id),
    status: literalValue(row.status, ["pending", "accepted", "cancelled", "declined"]),
    version: numberValue(row.version),
  };
}

function membershipSources(value: unknown): OrganizationMembershipSource[] {
  if (!Array.isArray(value)) throw new TypeError("Expected membership sources");
  return value.map((source) => {
    const row = record(source);
    return {
      kind: literalValue(row.kind, ["direct", "enterprise-team"]),
      id: stringValue(row.id),
      version: numberValue(row.version),
    };
  });
}

export class PostgresOrganizationPersistence {
  constructor(private readonly db: Database) {}

  list(actor: VerifiedLineActor, query: GovernanceQuery): Promise<OrganizationList> {
    return this.db.transaction(async (sql) => {
      await sql.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const principal = await resolveVerifiedLineActor(sql, actor);
      const ownerScopeIds = await readOrganizationOwnerScopeIds(sql, principal.userId);
      const rows = (
        await sql.query(
          `SELECT o.account_id AS id,o.name,o.status,o.version,
             m.status AS membership_status,
             d.version AS direct_membership_version,
             i.status AS invitation_status,i.version AS invitation_version
           FROM organizations o
           LEFT JOIN organization_memberships m
             ON m.organization_account_id=o.account_id AND m.user_id=$1
           LEFT JOIN organization_direct_memberships d
             ON d.organization_account_id=o.account_id AND d.user_id=$1 AND d.status='active'
           LEFT JOIN organization_invitations i
             ON i.organization_account_id=o.account_id AND i.user_id=$1
           WHERE (m.status='active' OR i.status='pending')
             AND ($2::text IS NULL OR o.account_id=$2)
             AND ($3::text IS NULL OR o.account_id>$3)
             AND (o.status='active' OR o.account_id=ANY($4::text[]))
           ORDER BY o.account_id LIMIT 21`,
          [principal.userId, query.id ?? null, query.after ?? null, ownerScopeIds],
          organizationListRow,
        )
      ).rows;
      const items: Array<OrganizationList["items"][number]> = [];
      for (const row of rows.slice(0, 20)) {
        const locator = await readAccountLogin(sql, row.id, "ORGANIZATION");
        if (!locator) {
          throw new GovernanceAccessError(409, "scope-conflict", "Organization login 不可用。");
        }
        const actorCapabilities = await readOrganizationViewerCapabilities(
          sql,
          principal.userId,
          row.id,
        );
        items.push({
          id: row.id,
          login: locator.login,
          name: row.name,
          status: row.status,
          version: row.version,
          actorMembershipStatus: row.membership_status ?? null,
          actorDirectMembershipVersion: row.direct_membership_version ?? null,
          actorInvitationStatus: row.invitation_status ?? null,
          actorInvitationVersion: row.invitation_version ?? null,
          actorIsOwner: ownerScopeIds.includes(row.id),
          actorMemberRole:
            actorCapabilities?.memberRole ?? (ownerScopeIds.includes(row.id) ? "ADMIN" : null),
          actorCanCreateProjectV2: actorCapabilities?.viewerCanCreateProjectV2 === true,
        });
      }
      const nextOrganization = rows.length > 20 ? rows[19] : undefined;
      if (rows.length > 20 && !nextOrganization) {
        throw new GovernanceAccessError(503, "unknown-result", "Organization 分頁結果不完整。");
      }
      return {
        items,
        next: nextOrganization?.id ?? null,
      };
    });
  }

  detail(actor: VerifiedLineActor, organizationAccountId: string): Promise<OrganizationDetail> {
    return this.db.transaction(async (sql) => {
      await sql.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const principal = await resolveVerifiedLineActor(sql, actor);
      const actorIsOwner = await hasOrganizationOwnerAssignment(
        sql,
        organizationAccountId,
        principal.userId,
      );
      const actorCapabilities = await readOrganizationViewerCapabilities(
        sql,
        principal.userId,
        organizationAccountId,
      );
      const actorCanAdminister = actorIsOwner || actorCapabilities?.viewerCanAdminister === true;
      const scope = (
        await sql.query(
          `SELECT o.account_id AS id,o.name,o.status,o.version,
             o.member_can_create_public_repositories,
             o.member_can_create_private_repositories,
             o.member_can_create_internal_repositories,
             o.member_can_create_project_v2,
             o.member_can_create_teams,
             m.status AS membership_status,
             d.version AS direct_membership_version,
             i.status AS invitation_status,i.version AS invitation_version
           FROM organizations o
           LEFT JOIN organization_memberships m
             ON m.organization_account_id=o.account_id AND m.user_id=$1
           LEFT JOIN organization_direct_memberships d
             ON d.organization_account_id=o.account_id AND d.user_id=$1 AND d.status='active'
           LEFT JOIN organization_invitations i
             ON i.organization_account_id=o.account_id AND i.user_id=$1
           WHERE o.account_id=$2 AND (m.status='active' OR i.status='pending')`,
          [principal.userId, organizationAccountId],
          organizationDetailRow,
        )
      ).rows[0];
      if (!scope || (scope.status !== "active" && !actorIsOwner)) {
        throw new GovernanceAccessError(403, "forbidden", "你不能檢視此 Organization。");
      }
      const locator = await readAccountLogin(sql, organizationAccountId, "ORGANIZATION");
      if (!locator) {
        throw new GovernanceAccessError(409, "scope-conflict", "Organization login 不可用。");
      }

      const memberRows = (
        await sql.query(
          `SELECT m.user_id,m.status,m.version,
             COALESCE((
               SELECT jsonb_agg(
                 jsonb_build_object('kind',s.source_kind,'id',s.source_id,'version',s.source_version)
                 ORDER BY s.source_kind,s.source_id
               )
               FROM organization_membership_sources s
               WHERE s.organization_account_id=m.organization_account_id
                 AND s.user_id=m.user_id
             ), '[]'::jsonb) AS sources,
             d.version AS direct_membership_version
           FROM organization_memberships m
           LEFT JOIN organization_direct_memberships d
             ON d.organization_account_id=m.organization_account_id
               AND d.user_id=m.user_id AND d.status='active'
           WHERE m.organization_account_id=$1 AND ($2::boolean OR m.user_id=$3)
           ORDER BY m.user_id`,
          [organizationAccountId, actorCanAdminister, principal.userId],
          organizationMemberRow,
        )
      ).rows;
      const ownerAssignments = new Map(
        (
          await readOrganizationOwnerAssignments(
            sql,
            organizationAccountId,
            memberRows.map((row) => String(row.user_id)),
          )
        ).map((row) => [row.userId, row.version] as const),
      );
      const invitationRows = (
        await sql.query(
          `SELECT user_id,status,version FROM organization_invitations
           WHERE organization_account_id=$1 AND ($2::boolean OR user_id=$3)
           ORDER BY user_id`,
          [organizationAccountId, actorCanAdminister, principal.userId],
          organizationInvitationRow,
        )
      ).rows;

      return {
        id: scope.id,
        login: locator.login,
        name: scope.name,
        status: scope.status,
        version: scope.version,
        actorMembershipStatus: scope.membership_status ?? null,
        actorDirectMembershipVersion: scope.direct_membership_version ?? null,
        actorInvitationStatus: scope.invitation_status ?? null,
        actorInvitationVersion: scope.invitation_version ?? null,
        actorIsOwner,
        actorMemberRole: actorCapabilities?.memberRole ?? (actorIsOwner ? "ADMIN" : null),
        actorCanCreateProjectV2: actorCapabilities?.viewerCanCreateProjectV2 === true,
        memberCreationPolicy: {
          memberCanCreatePublicRepositories: scope.member_can_create_public_repositories,
          memberCanCreatePrivateRepositories: scope.member_can_create_private_repositories,
          memberCanCreateInternalRepositories: scope.member_can_create_internal_repositories,
          memberCanCreateProjectV2: scope.member_can_create_project_v2,
          memberCanCreateTeams: scope.member_can_create_teams,
        },
        members: memberRows.map(
          (row): OrganizationMembershipProjection => ({
            userId: row.user_id,
            status: row.status,
            version: row.version,
            sources: membershipSources(row.sources),
            directMembershipVersion: row.direct_membership_version ?? null,
            effectiveOwner: ownerAssignments.has(row.user_id),
            assignmentVersion: ownerAssignments.get(row.user_id) ?? null,
            memberRole: ownerAssignments.has(row.user_id) ? "ADMIN" : "MEMBER",
          }),
        ),
        invitations: invitationRows.map(
          (row): OrganizationInvitationProjection => ({
            userId: row.user_id,
            status: row.status,
            version: row.version,
          }),
        ),
      };
    });
  }
}
