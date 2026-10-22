import type {
  GovernanceQuery,
  VerifiedLineActor,
} from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { resolveVerifiedLineActor } from "@line_bot_v1/identity-access/postgres";
import { resolveScopedName } from "@line_bot_v1/namespace/postgres";
import type { Database } from "@line_bot_v1/platform/postgres";
import {
  literalValue,
  nullableNumericValue,
  nullableString,
  numberValue,
  record,
  stringValue,
} from "@line_bot_v1/platform/validation";
import { repositoryPermissions } from "@line_bot_v1/repository/domain/repository/value-objects/repository-capability";
import type {
  EnterpriseAffiliationSource,
  EnterpriseDetail,
  EnterpriseDirectAffiliationProjection,
  EnterpriseInvitationProjection,
  EnterpriseList,
  EnterpriseTeamMembershipProjection,
  EnterpriseTeamOrganizationProjection,
  EnterpriseTeamProjection,
  EnterpriseUserProjection,
} from "../contracts/enterprise-governance.js";
import {
  hasEnterpriseOwnerAssignment,
  readEnterpriseOwnerAssignments,
  readEnterpriseOwnerScopeIds,
} from "./postgres-owner-roles.js";

function teamMemberships(value: unknown): EnterpriseTeamMembershipProjection[] {
  if (!Array.isArray(value)) throw new TypeError("Expected Enterprise Team memberships");
  return value.map((member) => {
    const row = record(member);
    return {
      userId: stringValue(row.userId),
      status: literalValue(row.status, ["active", "removed"]),
      version: numberValue(row.version),
    };
  });
}

function teamOrganizations(value: unknown): EnterpriseTeamOrganizationProjection[] {
  if (!Array.isArray(value)) throw new TypeError("Expected Enterprise Team organizations");
  return value.map((organization) => {
    const row = record(organization);
    return {
      organizationAccountId: stringValue(row.organizationAccountId),
      status: literalValue(row.status, ["active", "detached"]),
      version: numberValue(row.version),
    };
  });
}

function affiliationSources(value: unknown): EnterpriseAffiliationSource[] {
  if (!Array.isArray(value)) throw new TypeError("Expected Enterprise affiliations");
  return value.map((source) => {
    const row = record(source);
    return {
      kind: literalValue(row.kind, ["direct", "organization"]),
      id: stringValue(row.id),
      version: numberValue(row.version),
    };
  });
}

function nullableNumber(value: unknown): number | null {
  const numeric = nullableNumericValue(value);
  return numeric === null ? null : Number(numeric);
}

function enterpriseSummaryRow(row: Record<string, unknown>) {
  return {
    id: stringValue(row.id),
    name: nullableString(row.name),
    slug: nullableString(row.slug),
    status: literalValue(row.status, ["active", "inactive"]),
    version: numberValue(row.version),
    actor_affiliations: row.actor_affiliations,
    invitation_status:
      row.invitation_status === null
        ? null
        : literalValue(row.invitation_status, ["pending", "accepted", "cancelled", "declined"]),
    invitation_version: nullableNumber(row.invitation_version),
  };
}

function enterpriseIdentityRow(row: Record<string, unknown>) {
  return {
    id: stringValue(row.id),
    status: literalValue(row.status, ["active", "inactive"]),
  };
}

function enterpriseUserRow(row: Record<string, unknown>) {
  return { user_id: stringValue(row.user_id), sources: row.sources };
}

function directAffiliationRow(row: Record<string, unknown>) {
  return {
    user_id: stringValue(row.user_id),
    status: literalValue(row.status, ["active", "removed"]),
    version: numberValue(row.version),
  };
}

function invitationRow(row: Record<string, unknown>) {
  return {
    user_id: stringValue(row.user_id),
    status: literalValue(row.status, ["pending", "accepted", "cancelled", "declined"]),
    version: numberValue(row.version),
  };
}

function enterpriseOrganizationRow(row: Record<string, unknown>) {
  return {
    organizationAccountId: stringValue(row.organizationAccountId),
    status: literalValue(row.status, ["active", "detached"]),
    version: numberValue(row.version),
  };
}

function outsideCollaboratorRow(row: Record<string, unknown>) {
  return {
    organizationAccountId: stringValue(row.organizationAccountId),
    repositoryId: stringValue(row.repositoryId),
    userId: stringValue(row.userId),
    capability: literalValue(row.capability, repositoryPermissions),
    grantVersion: numberValue(row.grantVersion),
  };
}

function enterpriseTeamRow(row: Record<string, unknown>) {
  return {
    id: stringValue(row.id),
    name: stringValue(row.name),
    slug: stringValue(row.slug),
    version: numberValue(row.version),
    members: row.members,
    organizations: row.organizations,
  };
}

const actorAffiliationSql = `COALESCE((
  SELECT jsonb_agg(
    jsonb_build_object('kind',a.source_kind,'id',a.source_id,'version',a.source_version)
    ORDER BY a.source_kind,a.source_id
  )
  FROM enterprise_user_affiliations a
  WHERE a.enterprise_account_id=e.account_id AND a.user_id=$1
), '[]'::jsonb)`;

export function listEnterprises(
  db: Database,
  actor: VerifiedLineActor,
  query: GovernanceQuery,
): Promise<EnterpriseList> {
  return db.transaction(async (sql) => {
    await sql.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const principal = await resolveVerifiedLineActor(sql, actor);
    const ownerScopeIds = await readEnterpriseOwnerScopeIds(sql, principal.userId);
    const rows = (
      await sql.query(
        `SELECT e.account_id AS id,e.name,e.slug,e.status,e.version,
           ${actorAffiliationSql} AS actor_affiliations,
           i.status AS invitation_status,i.version AS invitation_version
         FROM enterprises e
         LEFT JOIN enterprise_invitations i
           ON i.enterprise_account_id=e.account_id AND i.user_id=$1
         WHERE (
             EXISTS (
               SELECT 1 FROM enterprise_user_affiliations a
               WHERE a.enterprise_account_id=e.account_id AND a.user_id=$1
             ) OR i.status='pending'
           )
           AND ($2::text IS NULL OR e.account_id=$2)
           AND ($3::text IS NULL OR e.account_id>$3)
           AND (e.status='active' OR e.account_id=ANY($4::text[]))
         ORDER BY e.account_id LIMIT 21`,
        [principal.userId, query.id ?? null, query.after ?? null, ownerScopeIds],
        enterpriseSummaryRow,
      )
    ).rows;
    const nextEnterprise = rows.length > 20 ? rows[19] : undefined;
    if (rows.length > 20 && !nextEnterprise) {
      throw new GovernanceAccessError(503, "unknown-result", "Enterprise 分頁結果不完整。");
    }
    return {
      items: rows.slice(0, 20).map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        status: row.status,
        version: row.version,
        actorAffiliations: affiliationSources(row.actor_affiliations),
        actorInvitationStatus: row.invitation_status ?? null,
        actorInvitationVersion: row.invitation_version ?? null,
        actorIsOwner: ownerScopeIds.includes(row.id),
      })),
      next: nextEnterprise?.id ?? null,
    };
  });
}

export function detailEnterpriseBySlug(
  db: Database,
  actor: VerifiedLineActor,
  slug: string,
): Promise<EnterpriseDetail> {
  return db
    .transaction(async (sql) => {
      const principal = await resolveVerifiedLineActor(sql, actor);
      const ownerScopeIds = await readEnterpriseOwnerScopeIds(sql, principal.userId);
      const binding = await resolveScopedName(
        sql,
        { family: "enterprise-slug", scopeKind: "GLOBAL", scopeId: "global" },
        slug,
      );
      if (!binding || binding.targetKind !== "ENTERPRISE") {
        throw new GovernanceAccessError(403, "forbidden", "你不能檢視此 Enterprise。");
      }
      const row = (
        await sql.query(
          `SELECT e.account_id AS id,e.status
           FROM enterprises e
           LEFT JOIN enterprise_invitations i
             ON i.enterprise_account_id=e.account_id AND i.user_id=$1
           WHERE e.account_id=$2
             AND (
               EXISTS (
                 SELECT 1 FROM enterprise_user_affiliations a
                 WHERE a.enterprise_account_id=e.account_id AND a.user_id=$1
               ) OR i.status='pending'
             )
           LIMIT 1`,
          [principal.userId, binding.targetId],
          enterpriseIdentityRow,
        )
      ).rows[0];
      if (!row || (row.status !== "active" && !ownerScopeIds.includes(row.id))) {
        throw new GovernanceAccessError(403, "forbidden", "你不能檢視此 Enterprise。");
      }
      return row.id;
    })
    .then((enterpriseAccountId) => detailEnterprise(db, actor, enterpriseAccountId));
}

export function detailEnterprise(
  db: Database,
  actor: VerifiedLineActor,
  enterpriseAccountId: string,
): Promise<EnterpriseDetail> {
  return db.transaction(async (sql) => {
    await sql.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const principal = await resolveVerifiedLineActor(sql, actor);
    const actorIsOwner = await hasEnterpriseOwnerAssignment(
      sql,
      enterpriseAccountId,
      principal.userId,
    );
    const scope = (
      await sql.query(
        `SELECT e.account_id AS id,e.name,e.slug,e.status,e.version,
           ${actorAffiliationSql} AS actor_affiliations,
           i.status AS invitation_status,i.version AS invitation_version
         FROM enterprises e
         LEFT JOIN enterprise_invitations i
           ON i.enterprise_account_id=e.account_id AND i.user_id=$1
         WHERE e.account_id=$2 AND (
           EXISTS (
             SELECT 1 FROM enterprise_user_affiliations a
             WHERE a.enterprise_account_id=e.account_id AND a.user_id=$1
           ) OR i.status='pending'
         )`,
        [principal.userId, enterpriseAccountId],
        enterpriseSummaryRow,
      )
    ).rows[0];
    if (!scope || (scope.status !== "active" && !actorIsOwner)) {
      throw new GovernanceAccessError(403, "forbidden", "你不能檢視此 Enterprise。");
    }

    const userRows = (
      await sql.query(
        `SELECT a.user_id,
           jsonb_agg(
             jsonb_build_object('kind',a.source_kind,'id',a.source_id,'version',a.source_version)
             ORDER BY a.source_kind,a.source_id
           ) AS sources
         FROM enterprise_user_affiliations a
         WHERE a.enterprise_account_id=$1 AND ($2::boolean OR a.user_id=$3)
         GROUP BY a.user_id
         ORDER BY a.user_id`,
        [enterpriseAccountId, actorIsOwner, principal.userId],
        enterpriseUserRow,
      )
    ).rows;
    const ownerAssignments = new Map(
      (
        await readEnterpriseOwnerAssignments(
          sql,
          enterpriseAccountId,
          userRows.map((row) => String(row.user_id)),
        )
      ).map((row) => [row.userId, row.version] as const),
    );

    const directRows = actorIsOwner
      ? (
          await sql.query(
            `SELECT user_id,status,version FROM enterprise_direct_affiliations
             WHERE enterprise_account_id=$1 ORDER BY user_id`,
            [enterpriseAccountId],
            directAffiliationRow,
          )
        ).rows
      : (
          await sql.query(
            `SELECT user_id,status,version FROM enterprise_direct_affiliations
             WHERE enterprise_account_id=$1 AND user_id=$2`,
            [enterpriseAccountId, principal.userId],
            directAffiliationRow,
          )
        ).rows;
    const invitationRows = actorIsOwner
      ? (
          await sql.query(
            `SELECT user_id,status,version FROM enterprise_invitations
             WHERE enterprise_account_id=$1 ORDER BY user_id`,
            [enterpriseAccountId],
            invitationRow,
          )
        ).rows
      : (
          await sql.query(
            `SELECT user_id,status,version FROM enterprise_invitations
             WHERE enterprise_account_id=$1 AND user_id=$2`,
            [enterpriseAccountId, principal.userId],
            invitationRow,
          )
        ).rows;

    const organizations: EnterpriseDetail["organizations"] = actorIsOwner
      ? (
          await sql.query(
            `SELECT organization_account_id AS "organizationAccountId",status,version
             FROM enterprise_organizations WHERE enterprise_account_id=$1
             ORDER BY organization_account_id`,
            [enterpriseAccountId],
            enterpriseOrganizationRow,
          )
        ).rows
      : [];
    const outsideRepositoryCollaborators: EnterpriseDetail["outsideRepositoryCollaborators"] =
      actorIsOwner
        ? (
            await sql.query(
              `SELECT
                 organization_account_id AS "organizationAccountId",
                 repository_id AS "repositoryId",
                 user_id AS "userId",
                 capability,
                 grant_version AS "grantVersion"
               FROM enterprise_repository_outside_collaborators
               WHERE enterprise_account_id=$1
              ORDER BY organization_account_id,repository_id,user_id`,
              [enterpriseAccountId],
              outsideCollaboratorRow,
            )
          ).rows
        : [];
    const teamRows = (
      await sql.query(
        `SELECT t.id,t.name,t.slug,t.version,
           COALESCE((
             SELECT jsonb_agg(
               jsonb_build_object('userId',m.user_id,'status',m.status,'version',m.version)
               ORDER BY m.user_id
             ) FROM enterprise_team_memberships m
             WHERE m.team_id=t.id AND ($2::boolean OR m.user_id=$3)
           ), '[]'::jsonb) AS members,
           COALESCE((
             SELECT jsonb_agg(
               jsonb_build_object('organizationAccountId',a.organization_account_id,'status',a.status,'version',a.version)
               ORDER BY a.organization_account_id
             ) FROM enterprise_team_organizations a WHERE a.team_id=t.id
           ), '[]'::jsonb) AS organizations
         FROM enterprise_teams t
         WHERE t.enterprise_account_id=$1
           AND ($2::boolean OR EXISTS (
             SELECT 1 FROM enterprise_team_memberships self_m
             WHERE self_m.team_id=t.id AND self_m.user_id=$3 AND self_m.status='active'
           ))
         ORDER BY t.id`,
        [enterpriseAccountId, actorIsOwner, principal.userId],
        enterpriseTeamRow,
      )
    ).rows;

    return {
      id: scope.id,
      name: scope.name,
      slug: scope.slug,
      status: scope.status,
      version: scope.version,
      actorAffiliations: affiliationSources(scope.actor_affiliations),
      actorInvitationStatus: scope.invitation_status ?? null,
      actorInvitationVersion: scope.invitation_version ?? null,
      actorIsOwner,
      users: userRows.map(
        (row): EnterpriseUserProjection => ({
          userId: row.user_id,
          sources: affiliationSources(row.sources),
          effectiveOwner: ownerAssignments.has(row.user_id),
          assignmentVersion: ownerAssignments.get(row.user_id) ?? null,
        }),
      ),
      directAffiliations: directRows.map(
        (row): EnterpriseDirectAffiliationProjection => ({
          userId: row.user_id,
          status: row.status,
          version: row.version,
        }),
      ),
      invitations: invitationRows.map(
        (row): EnterpriseInvitationProjection => ({
          userId: row.user_id,
          status: row.status,
          version: row.version,
        }),
      ),
      organizations,
      outsideRepositoryCollaborators,
      teams: teamRows.map(
        (row): EnterpriseTeamProjection => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          version: row.version,
          members: teamMemberships(row.members),
          organizations: teamOrganizations(row.organizations),
        }),
      ),
    };
  });
}
