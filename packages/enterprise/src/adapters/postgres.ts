import { randomUUID } from "node:crypto";
import {
  governanceFingerprint,
  hasEnterpriseOwnerAssignment,
  hasOrganizationOwnerAssignment,
  hasReplacementEnterpriseOwner,
  isOrganizationOwner,
  readEnterpriseOwnerAssignments,
  readEnterpriseOwnerScopeIds,
  readGovernanceReplay,
  recordGovernanceResult,
  requireActiveTargetUser,
  requireEnterpriseLifecycleOwner,
  requireEnterpriseOwner,
  resolveVerifiedLineActor,
  revokeEnterpriseOwnerForAffiliationRemoval,
} from "@line-work/identity-access/adapters/postgres";
import type {
  GovernanceQuery,
  VerifiedLineActor,
} from "@line-work/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line-work/identity-access/domain/role-assignment";
import {
  assertOrganizationMembershipSourceRemovable,
  cancelPendingOrganizationInvitation,
  readOrganizationQualification,
  refreshOrganizationMembershipFromSources,
} from "@line-work/organization/adapters/postgres";
import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";
import type { EnterpriseGovernancePort } from "../application/ports/enterprise-governance.js";
import type {
  EnterpriseAffiliationSource,
  EnterpriseCommand,
  EnterpriseDetail,
  EnterpriseDirectAffiliationProjection,
  EnterpriseInvitationProjection,
  EnterpriseList,
  EnterpriseReceipt,
  EnterpriseTeamMembershipProjection,
  EnterpriseTeamOrganizationProjection,
  EnterpriseTeamProjection,
  EnterpriseUserProjection,
} from "../contracts/enterprise-governance.js";
import { enterpriseTeamSlugFromName } from "../domain.js";

function makeReceipt(
  command: EnterpriseCommand,
  status: string,
  version: number,
  at: number,
  teamIdOverride: string | null = null,
): EnterpriseReceipt {
  const enterpriseAccountId = "enterpriseAccountId" in command ? command.enterpriseAccountId : "";
  const userId = "targetUserId" in command ? command.targetUserId : null;
  const organizationAccountId =
    "organizationAccountId" in command ? command.organizationAccountId : null;
  const teamId = teamIdOverride ?? ("teamId" in command ? command.teamId : null);
  const teamSubject =
    teamId &&
    (command.action === "create-enterprise-team" ||
      command.action === "rename-enterprise-team" ||
      command.action === "assign-enterprise-team-organization" ||
      command.action === "detach-enterprise-team-organization")
      ? teamId
      : null;
  return {
    requestId: command.requestId,
    action: command.action,
    scopeId: enterpriseAccountId,
    subjectKind: userId
      ? "user"
      : teamSubject
        ? "enterprise-team"
        : organizationAccountId
          ? "organization"
          : null,
    subjectId: userId ?? teamSubject ?? organizationAccountId,
    status,
    version,
    at,
  };
}

async function lockEnterprise(sql: Sql, id: string) {
  const row = (
    await sql.query(
      "SELECT account_id,status,version FROM enterprises WHERE account_id=$1 FOR UPDATE",
      [id],
    )
  ).rows[0];
  if (!row) throw new GovernanceAccessError(404, "not-found", "找不到 Enterprise。");
  return row;
}

async function hasEffectiveAffiliation(sql: Sql, enterpriseId: string, userId: string) {
  return Boolean(
    (
      await sql.query(
        `SELECT 1 FROM enterprise_user_affiliations
         WHERE enterprise_account_id=$1 AND user_id=$2 LIMIT 1`,
        [enterpriseId, userId],
      )
    ).rows[0],
  );
}

async function lockEnterpriseTeam(sql: Sql, enterpriseAccountId: string, teamId: string) {
  const row = (
    await sql.query(
      `SELECT id,name,slug,version FROM enterprise_teams
       WHERE enterprise_account_id=$1 AND id=$2 FOR UPDATE`,
      [enterpriseAccountId, teamId],
    )
  ).rows[0];
  if (!row) throw new GovernanceAccessError(404, "not-found", "找不到 Enterprise Team。");
  return row;
}

async function requireActiveEnterpriseOrganization(
  sql: Sql,
  enterpriseAccountId: string,
  organizationAccountId: string,
) {
  const relation = (
    await sql.query(
      `SELECT version FROM enterprise_organizations
       WHERE enterprise_account_id=$1 AND organization_account_id=$2 AND status='active'
       FOR SHARE`,
      [enterpriseAccountId, organizationAccountId],
    )
  ).rows[0];
  const organization = await readOrganizationQualification(sql, organizationAccountId, "share");
  if (!relation || organization?.status !== "active") {
    throw new GovernanceAccessError(
      409,
      "scope-conflict",
      "Enterprise Team 只能指派到目前由此 Enterprise 治理的 active Organization。",
    );
  }
  return relation;
}

async function activeEnterpriseTeamMemberIds(
  sql: Sql,
  enterpriseAccountId: string,
  teamId: string,
) {
  const rows = (
    await sql.query(
      `SELECT user_id FROM enterprise_team_memberships
       WHERE enterprise_account_id=$1 AND team_id=$2 AND status='active'
       ORDER BY user_id FOR SHARE`,
      [enterpriseAccountId, teamId],
    )
  ).rows;
  return rows.map((row) => row.user_id as string);
}

async function activeEnterpriseTeamOrganizationIds(
  sql: Sql,
  enterpriseAccountId: string,
  teamId: string,
) {
  const rows = (
    await sql.query(
      `SELECT organization_account_id FROM enterprise_team_organizations
       WHERE enterprise_account_id=$1 AND team_id=$2 AND status='active'
       ORDER BY organization_account_id FOR SHARE`,
      [enterpriseAccountId, teamId],
    )
  ).rows;
  return rows.map((row) => row.organization_account_id as string);
}

function teamMemberships(value: unknown): EnterpriseTeamMembershipProjection[] {
  if (!Array.isArray(value)) return [];
  return value.map((member) => {
    const row = member as { userId: string; status: "active" | "removed"; version: number };
    return { userId: row.userId, status: row.status, version: row.version };
  });
}

function teamOrganizations(value: unknown): EnterpriseTeamOrganizationProjection[] {
  if (!Array.isArray(value)) return [];
  return value.map((organization) => {
    const row = organization as {
      organizationAccountId: string;
      status: "active" | "detached";
      version: number;
    };
    return {
      organizationAccountId: row.organizationAccountId,
      status: row.status,
      version: row.version,
    };
  });
}

function affiliationSources(value: unknown): EnterpriseAffiliationSource[] {
  if (!Array.isArray(value)) return [];
  return value.map((source) => {
    const row = source as { kind: "direct" | "organization"; id: string; version: number };
    return { kind: row.kind, id: row.id, version: row.version };
  });
}

const actorAffiliationSql = `COALESCE((
  SELECT jsonb_agg(
    jsonb_build_object('kind',a.source_kind,'id',a.source_id,'version',a.source_version)
    ORDER BY a.source_kind,a.source_id
  )
  FROM enterprise_user_affiliations a
  WHERE a.enterprise_account_id=e.account_id AND a.user_id=$1
), '[]'::jsonb)`;

export class PostgresEnterpriseGovernance implements EnterpriseGovernancePort {
  constructor(private readonly db: Database = businessDatabase()) {}

  list(actor: VerifiedLineActor, query: GovernanceQuery): Promise<EnterpriseList> {
    return this.db.transaction(async (sql) => {
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
        )
      ).rows;
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
        next: rows.length > 20 ? rows[19]!.id : null,
      };
    });
  }

  detailBySlug(actor: VerifiedLineActor, slug: string): Promise<EnterpriseDetail> {
    return this.db
      .transaction(async (sql) => {
        const principal = await resolveVerifiedLineActor(sql, actor);
        const ownerScopeIds = await readEnterpriseOwnerScopeIds(sql, principal.userId);
        const row = (
          await sql.query(
            `SELECT e.account_id AS id,e.status
             FROM enterprises e
             LEFT JOIN enterprise_invitations i
               ON i.enterprise_account_id=e.account_id AND i.user_id=$1
             WHERE e.slug=$2
               AND (
                 EXISTS (
                   SELECT 1 FROM enterprise_user_affiliations a
                   WHERE a.enterprise_account_id=e.account_id AND a.user_id=$1
                 ) OR i.status='pending'
               )
             LIMIT 1`,
            [principal.userId, slug],
          )
        ).rows[0] as { id: string; status: "active" | "inactive" } | undefined;
        if (!row || (row.status !== "active" && !ownerScopeIds.includes(row.id))) {
          throw new GovernanceAccessError(403, "forbidden", "你不能檢視此 Enterprise。");
        }
        return row.id;
      })
      .then((enterpriseAccountId) => this.detail(actor, enterpriseAccountId));
  }

  detail(actor: VerifiedLineActor, enterpriseAccountId: string): Promise<EnterpriseDetail> {
    return this.db.transaction(async (sql) => {
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
            )
          ).rows
        : (
            await sql.query(
              `SELECT user_id,status,version FROM enterprise_direct_affiliations
               WHERE enterprise_account_id=$1 AND user_id=$2`,
              [enterpriseAccountId, principal.userId],
            )
          ).rows;
      const invitationRows = actorIsOwner
        ? (
            await sql.query(
              `SELECT user_id,status,version FROM enterprise_invitations
               WHERE enterprise_account_id=$1 ORDER BY user_id`,
              [enterpriseAccountId],
            )
          ).rows
        : (
            await sql.query(
              `SELECT user_id,status,version FROM enterprise_invitations
               WHERE enterprise_account_id=$1 AND user_id=$2`,
              [enterpriseAccountId, principal.userId],
            )
          ).rows;

      const organizations: EnterpriseDetail["organizations"] = actorIsOwner
        ? (
            await sql.query(
              `SELECT organization_account_id AS "organizationAccountId",status,version
               FROM enterprise_organizations WHERE enterprise_account_id=$1
               ORDER BY organization_account_id`,
              [enterpriseAccountId],
            )
          ).rows.map((row) => ({
            organizationAccountId: row.organizationAccountId as string,
            status: row.status as "active" | "detached",
            version: row.version as number,
          }))
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

  execute(
    actor: VerifiedLineActor,
    command: EnterpriseCommand,
    now: number,
  ): Promise<EnterpriseReceipt> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock(71020260912::bigint)");
      const principal = await resolveVerifiedLineActor(sql, actor);
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${principal.userId}:${command.requestId}`,
      ]);
      const fingerprint = governanceFingerprint(command);

      if (command.action === "create-enterprise") {
        const replay = await readGovernanceReplay(
          sql,
          principal.userId,
          command.requestId,
          fingerprint,
        );
        if (replay) return replay;
        const enterpriseAccountId = randomUUID();
        let provisioned: Record<string, unknown> | undefined;
        try {
          provisioned = (
            await sql.query(
              "SELECT scope_version FROM app_private.provision_enterprise_scope($1,$2,$3,$4,$5)",
              [enterpriseAccountId, principal.userId, command.slug, command.name, now],
            )
          ).rows[0];
        } catch (error) {
          if ((error as { code?: string }).code === "23505") {
            throw new GovernanceAccessError(409, "conflict", "Enterprise slug 已被使用。");
          }
          throw error;
        }
        if (!provisioned)
          throw new GovernanceAccessError(503, "unknown-result", "Enterprise 建立結果不完整。");
        const result: EnterpriseReceipt = {
          requestId: command.requestId,
          action: command.action,
          scopeId: enterpriseAccountId,
          subjectKind: null,
          subjectId: null,
          status: "active",
          version: Number(provisioned.scope_version),
          at: now,
        };
        await recordGovernanceResult(sql, {
          actorUserId: principal.userId,
          actorStatusVersion: principal.userStatusVersion,
          requestId: command.requestId,
          fingerprint,
          action: command.action,
          scopeKind: "enterprise",
          scopeId: enterpriseAccountId,
          subjectKind: null,
          subjectId: null,
          reason: command.reason,
          at: now,
          result,
        });
        return result;
      }

      const enterprise = await lockEnterprise(sql, command.enterpriseAccountId);

      let organization: { id: string; status: "active" | "inactive"; version: number } | null =
        null;
      if (command.action === "attach-organization" || command.action === "detach-organization") {
        organization = await readOrganizationQualification(
          sql,
          command.organizationAccountId,
          "update",
        );
        if (!organization)
          throw new GovernanceAccessError(404, "not-found", "找不到 Organization。");
        if (command.action === "detach-organization") {
          await requireEnterpriseLifecycleOwner(sql, command.enterpriseAccountId, principal.userId);
          if (
            !(await hasOrganizationOwnerAssignment(
              sql,
              command.organizationAccountId,
              principal.userId,
            ))
          ) {
            throw new GovernanceAccessError(
              403,
              "consent-required",
              "需要目前 OrganizationOwner 同意解除治理關係。",
            );
          }
        } else {
          await requireEnterpriseOwner(sql, command.enterpriseAccountId, principal.userId);
          if (!(await isOrganizationOwner(sql, command.organizationAccountId, principal.userId))) {
            throw new GovernanceAccessError(
              403,
              "consent-required",
              "需要目前 OrganizationOwner 同意建立治理關係。",
            );
          }
        }
      } else if (
        command.action === "accept-invitation" ||
        command.action === "decline-invitation"
      ) {
        if (command.targetUserId !== principal.userId) {
          throw new GovernanceAccessError(
            403,
            "forbidden",
            "只能接受自己的 Enterprise invitation。",
          );
        }
      } else if (command.action === "deactivate" || command.action === "reactivate") {
        await requireEnterpriseLifecycleOwner(sql, command.enterpriseAccountId, principal.userId);
      } else if (command.action !== "leave-enterprise") {
        await requireEnterpriseOwner(sql, command.enterpriseAccountId, principal.userId);
      }

      const replay = await readGovernanceReplay(
        sql,
        principal.userId,
        command.requestId,
        fingerprint,
      );
      if (replay) return replay;

      let result: EnterpriseReceipt;
      if (command.action === "deactivate" || command.action === "reactivate") {
        if (enterprise.version !== command.expectedVersion)
          throw new GovernanceAccessError(409, "conflict", "Enterprise 版本已更新。");
        const from = command.action === "deactivate" ? "active" : "inactive";
        const wanted = command.action === "deactivate" ? "inactive" : "active";
        if (enterprise.status !== from)
          throw new GovernanceAccessError(
            409,
            "invalid-transition",
            "Enterprise lifecycle 狀態不適用此操作。",
          );
        const changed = (
          await sql.query(
            `UPDATE enterprises SET status=$2,version=version+1
             WHERE account_id=$1 RETURNING version`,
            [command.enterpriseAccountId, wanted],
          )
        ).rows[0]!;
        result = makeReceipt(command, wanted, changed.version, now);
      } else if (
        command.action === "attach-organization" ||
        command.action === "detach-organization"
      ) {
        if (
          enterprise.version !== command.expectedEnterpriseVersion ||
          organization!.version !== command.expectedOrganizationVersion
        ) {
          throw new GovernanceAccessError(
            409,
            "conflict",
            "Enterprise 或 Organization 版本已更新。",
          );
        }
        if (
          command.action === "attach-organization" &&
          (enterprise.status !== "active" || organization!.status !== "active")
        ) {
          throw new GovernanceAccessError(409, "inactive", "停用的範圍不能建立治理關係。");
        }
        const relation = (
          await sql.query(
            `SELECT status,version FROM enterprise_organizations
             WHERE enterprise_account_id=$1 AND organization_account_id=$2 FOR UPDATE`,
            [command.enterpriseAccountId, command.organizationAccountId],
          )
        ).rows[0];
        if (command.action === "attach-organization") {
          if (!relation) {
            if (command.expectedRelationVersion !== 0)
              throw new GovernanceAccessError(409, "conflict", "治理關係版本不符。");
            try {
              await sql.query(
                `INSERT INTO enterprise_organizations(
                   enterprise_account_id,organization_account_id,status,version,attached_at
                 ) VALUES($1,$2,'active',1,$3)`,
                [command.enterpriseAccountId, command.organizationAccountId, now],
              );
            } catch (error) {
              if ((error as { code?: string }).code === "23505")
                throw new GovernanceAccessError(
                  409,
                  "scope-conflict",
                  "Organization 已由其他 Enterprise 治理。",
                );
              throw error;
            }
            result = makeReceipt(command, "active", 1, now);
          } else {
            if (
              relation.version !== command.expectedRelationVersion ||
              relation.status !== "detached"
            ) {
              throw new GovernanceAccessError(409, "conflict", "治理關係狀態或版本不符。");
            }
            try {
              const changed = (
                await sql.query(
                  `UPDATE enterprise_organizations
                   SET status='active',version=version+1,detached_at=null
                   WHERE enterprise_account_id=$1 AND organization_account_id=$2 RETURNING version`,
                  [command.enterpriseAccountId, command.organizationAccountId],
                )
              ).rows[0]!;
              result = makeReceipt(command, "active", changed.version, now);
            } catch (error) {
              if ((error as { code?: string }).code === "23505")
                throw new GovernanceAccessError(
                  409,
                  "scope-conflict",
                  "Organization 已由其他 Enterprise 治理。",
                );
              throw error;
            }
          }
        } else {
          if (
            !relation ||
            relation.status !== "active" ||
            relation.version !== command.expectedRelationVersion
          ) {
            throw new GovernanceAccessError(409, "conflict", "找不到指定版本的有效治理關係。");
          }
          const activeTeamAssignment = (
            await sql.query(
              `SELECT 1 FROM enterprise_team_organizations
               WHERE enterprise_account_id=$1 AND organization_account_id=$2 AND status='active'
               LIMIT 1`,
              [command.enterpriseAccountId, command.organizationAccountId],
            )
          ).rows[0];
          if (activeTeamAssignment) {
            throw new GovernanceAccessError(
              409,
              "invalid-transition",
              "請先解除所有 Enterprise Team 對此 Organization 的 assignment。",
            );
          }
          const changed = (
            await sql.query(
              `UPDATE enterprise_organizations
               SET status='detached',version=version+1,detached_at=$3
               WHERE enterprise_account_id=$1 AND organization_account_id=$2 RETURNING version`,
              [command.enterpriseAccountId, command.organizationAccountId, now],
            )
          ).rows[0]!;
          result = makeReceipt(command, "detached", changed.version, now);
        }
      } else if (command.action === "create-enterprise-team") {
        if (enterprise.status !== "active") {
          throw new GovernanceAccessError(409, "inactive", "Enterprise 已停用。");
        }
        const teamId = randomUUID();
        const slug = enterpriseTeamSlugFromName(command.name);
        try {
          await sql.query(
            `INSERT INTO enterprise_teams(
               id,enterprise_account_id,name,slug,version,created_by_user_id,created_at
             ) VALUES($1,$2,$3,$4,1,$5,$6)`,
            [teamId, command.enterpriseAccountId, command.name, slug, principal.userId, now],
          );
        } catch (error) {
          const postgres = error as { code?: string; constraint?: string };
          if (
            postgres.code === "23505" &&
            postgres.constraint === "enterprise_teams_enterprise_slug"
          ) {
            throw new GovernanceAccessError(
              409,
              "conflict",
              "此 Enterprise 已有相同 Enterprise Team slug。",
            );
          }
          throw error;
        }
        result = makeReceipt(command, "created", 1, now, teamId);
      } else if ("teamId" in command) {
        if (enterprise.status !== "active") {
          throw new GovernanceAccessError(409, "inactive", "Enterprise 已停用。");
        }
        const team = await lockEnterpriseTeam(sql, command.enterpriseAccountId, command.teamId);
        if (command.action === "rename-enterprise-team") {
          if (team.version !== command.expectedVersion) {
            throw new GovernanceAccessError(409, "conflict", "Enterprise Team 版本已更新。");
          }
          if (team.name === command.name) {
            throw new GovernanceAccessError(
              409,
              "invalid-transition",
              "Enterprise Team 名稱沒有變更。",
            );
          }
          const slug = enterpriseTeamSlugFromName(command.name);
          let changed: { version: number };
          try {
            changed = (
              await sql.query(
                `UPDATE enterprise_teams
                 SET name=$3,slug=$4,version=version+1
                 WHERE enterprise_account_id=$1 AND id=$2 RETURNING version`,
                [command.enterpriseAccountId, command.teamId, command.name, slug],
              )
            ).rows[0] as { version: number };
          } catch (error) {
            const postgres = error as { code?: string; constraint?: string };
            if (
              postgres.code === "23505" &&
              postgres.constraint === "enterprise_teams_enterprise_slug"
            ) {
              throw new GovernanceAccessError(
                409,
                "conflict",
                "此 Enterprise 已有相同 Enterprise Team slug。",
              );
            }
            throw error;
          }
          result = makeReceipt(command, "renamed", changed.version, now);
        } else if (
          command.action === "add-enterprise-team-member" ||
          command.action === "remove-enterprise-team-member"
        ) {
          const membership = (
            await sql.query(
              `SELECT status,version FROM enterprise_team_memberships
               WHERE enterprise_account_id=$1 AND team_id=$2 AND user_id=$3 FOR UPDATE`,
              [command.enterpriseAccountId, command.teamId, command.targetUserId],
            )
          ).rows[0];
          if (command.action === "add-enterprise-team-member") {
            await requireActiveTargetUser(sql, command.targetUserId);
            if (
              !(await hasEffectiveAffiliation(
                sql,
                command.enterpriseAccountId,
                command.targetUserId,
              ))
            ) {
              throw new GovernanceAccessError(
                403,
                "forbidden",
                "Enterprise Team member 必須是目前 Enterprise user。",
              );
            }
            if (
              (!membership && command.expectedVersion !== 0) ||
              (membership && membership.version !== command.expectedVersion)
            ) {
              throw new GovernanceAccessError(
                409,
                "conflict",
                "Enterprise Team membership 版本不符。",
              );
            }
            if (membership?.status === "active") {
              throw new GovernanceAccessError(
                409,
                "invalid-transition",
                "使用者已在 Enterprise Team。",
              );
            }
            let version: number;
            if (membership) {
              version = (
                await sql.query(
                  `UPDATE enterprise_team_memberships
                   SET status='active',version=version+1,joined_at=$4
                   WHERE enterprise_account_id=$1 AND team_id=$2 AND user_id=$3
                   RETURNING version`,
                  [command.enterpriseAccountId, command.teamId, command.targetUserId, now],
                )
              ).rows[0]!.version;
            } else {
              await sql.query(
                `INSERT INTO enterprise_team_memberships(
                   team_id,enterprise_account_id,user_id,status,version,joined_at
                 ) VALUES($1,$2,$3,'active',1,$4)`,
                [command.teamId, command.enterpriseAccountId, command.targetUserId, now],
              );
              version = 1;
            }
            const organizationIds = await activeEnterpriseTeamOrganizationIds(
              sql,
              command.enterpriseAccountId,
              command.teamId,
            );
            for (const organizationAccountId of organizationIds) {
              await refreshOrganizationMembershipFromSources(
                sql,
                organizationAccountId,
                command.targetUserId,
                now,
              );
              await cancelPendingOrganizationInvitation(
                sql,
                organizationAccountId,
                command.targetUserId,
                now,
              );
            }
            result = makeReceipt(command, "active", version, now);
          } else {
            if (
              !membership ||
              membership.status !== "active" ||
              membership.version !== command.expectedVersion
            ) {
              throw new GovernanceAccessError(
                409,
                "conflict",
                "Enterprise Team membership 版本不符。",
              );
            }
            const organizationIds = await activeEnterpriseTeamOrganizationIds(
              sql,
              command.enterpriseAccountId,
              command.teamId,
            );
            for (const organizationAccountId of organizationIds) {
              await assertOrganizationMembershipSourceRemovable(
                sql,
                organizationAccountId,
                command.targetUserId,
                "enterprise-team",
                command.teamId,
              );
            }
            const changed = (
              await sql.query(
                `UPDATE enterprise_team_memberships SET status='removed',version=version+1
                 WHERE enterprise_account_id=$1 AND team_id=$2 AND user_id=$3
                 RETURNING version`,
                [command.enterpriseAccountId, command.teamId, command.targetUserId],
              )
            ).rows[0]!;
            for (const organizationAccountId of organizationIds) {
              await refreshOrganizationMembershipFromSources(
                sql,
                organizationAccountId,
                command.targetUserId,
                now,
              );
            }
            result = makeReceipt(command, "removed", changed.version, now);
          }
        } else if (
          command.action === "assign-enterprise-team-organization" ||
          command.action === "detach-enterprise-team-organization"
        ) {
          await requireActiveEnterpriseOrganization(
            sql,
            command.enterpriseAccountId,
            command.organizationAccountId,
          );
          const assignment = (
            await sql.query(
              `SELECT status,version FROM enterprise_team_organizations
               WHERE enterprise_account_id=$1 AND team_id=$2 AND organization_account_id=$3
               FOR UPDATE`,
              [command.enterpriseAccountId, command.teamId, command.organizationAccountId],
            )
          ).rows[0];
          if (command.action === "assign-enterprise-team-organization") {
            if (
              (!assignment && command.expectedVersion !== 0) ||
              (assignment && assignment.version !== command.expectedVersion)
            ) {
              throw new GovernanceAccessError(
                409,
                "conflict",
                "Enterprise Team assignment 版本不符。",
              );
            }
            if (assignment?.status === "active") {
              throw new GovernanceAccessError(
                409,
                "invalid-transition",
                "Enterprise Team 已指派到 Organization。",
              );
            }
            let version: number;
            if (assignment) {
              version = (
                await sql.query(
                  `UPDATE enterprise_team_organizations
                   SET status='active',version=version+1,assigned_at=$4,detached_at=null
                   WHERE enterprise_account_id=$1 AND team_id=$2 AND organization_account_id=$3
                   RETURNING version`,
                  [command.enterpriseAccountId, command.teamId, command.organizationAccountId, now],
                )
              ).rows[0]!.version;
            } else {
              await sql.query(
                `INSERT INTO enterprise_team_organizations(
                   team_id,enterprise_account_id,organization_account_id,status,version,assigned_at,detached_at
                 ) VALUES($1,$2,$3,'active',1,$4,null)`,
                [command.teamId, command.enterpriseAccountId, command.organizationAccountId, now],
              );
              version = 1;
            }
            const memberIds = await activeEnterpriseTeamMemberIds(
              sql,
              command.enterpriseAccountId,
              command.teamId,
            );
            for (const userId of memberIds) {
              await refreshOrganizationMembershipFromSources(
                sql,
                command.organizationAccountId,
                userId,
                now,
              );
              await cancelPendingOrganizationInvitation(
                sql,
                command.organizationAccountId,
                userId,
                now,
              );
            }
            result = makeReceipt(command, "active", version, now);
          } else {
            if (
              !assignment ||
              assignment.status !== "active" ||
              assignment.version !== command.expectedVersion
            ) {
              throw new GovernanceAccessError(
                409,
                "conflict",
                "Enterprise Team assignment 版本不符。",
              );
            }
            const memberIds = await activeEnterpriseTeamMemberIds(
              sql,
              command.enterpriseAccountId,
              command.teamId,
            );
            for (const userId of memberIds) {
              await assertOrganizationMembershipSourceRemovable(
                sql,
                command.organizationAccountId,
                userId,
                "enterprise-team",
                command.teamId,
              );
            }
            const changed = (
              await sql.query(
                `UPDATE enterprise_team_organizations
                 SET status='detached',version=version+1,detached_at=$4
                 WHERE enterprise_account_id=$1 AND team_id=$2 AND organization_account_id=$3
                 RETURNING version`,
                [command.enterpriseAccountId, command.teamId, command.organizationAccountId, now],
              )
            ).rows[0]!;
            for (const userId of memberIds) {
              await refreshOrganizationMembershipFromSources(
                sql,
                command.organizationAccountId,
                userId,
                now,
              );
            }
            result = makeReceipt(command, "detached", changed.version, now);
          }
        } else {
          throw new GovernanceAccessError(400, "invalid-input", "Enterprise Team 操作格式不正確。");
        }
      } else {
        const targetUserId =
          command.action === "leave-enterprise"
            ? principal.userId
            : "targetUserId" in command
              ? command.targetUserId
              : null;
        if (!targetUserId)
          throw new GovernanceAccessError(400, "invalid-input", "Enterprise 人員操作格式不正確。");
        if (enterprise.status !== "active")
          throw new GovernanceAccessError(409, "inactive", "Enterprise 已停用。");
        const direct = (
          await sql.query(
            `SELECT status,version FROM enterprise_direct_affiliations
             WHERE enterprise_account_id=$1 AND user_id=$2 FOR UPDATE`,
            [command.enterpriseAccountId, targetUserId],
          )
        ).rows[0];
        const invitation = (
          await sql.query(
            `SELECT status,version FROM enterprise_invitations
             WHERE enterprise_account_id=$1 AND user_id=$2 FOR UPDATE`,
            [command.enterpriseAccountId, targetUserId],
          )
        ).rows[0];

        if (command.action === "invite-user") {
          if (
            await hasEffectiveAffiliation(sql, command.enterpriseAccountId, command.targetUserId)
          ) {
            throw new GovernanceAccessError(
              409,
              "invalid-transition",
              "使用者已是 Enterprise user。",
            );
          }
          await requireActiveTargetUser(sql, command.targetUserId);
          if (!invitation) {
            if (command.expectedVersion !== 0)
              throw new GovernanceAccessError(409, "conflict", "Invitation 版本不符。");
            await sql.query(
              `INSERT INTO enterprise_invitations(
                 enterprise_account_id,user_id,status,version,created_at,resolved_at
               ) VALUES($1,$2,'pending',1,$3,null)`,
              [command.enterpriseAccountId, command.targetUserId, now],
            );
            result = makeReceipt(command, "pending", 1, now);
          } else {
            if (invitation.version !== command.expectedVersion || invitation.status === "pending") {
              throw new GovernanceAccessError(409, "conflict", "Invitation 狀態或版本不符。");
            }
            const changed = (
              await sql.query(
                `UPDATE enterprise_invitations
                 SET status='pending',version=version+1,created_at=$3,resolved_at=null
                 WHERE enterprise_account_id=$1 AND user_id=$2 RETURNING version`,
                [command.enterpriseAccountId, command.targetUserId, now],
              )
            ).rows[0]!;
            result = makeReceipt(command, "pending", changed.version, now);
          }
        } else if (command.action === "accept-invitation") {
          if (
            !invitation ||
            invitation.status !== "pending" ||
            invitation.version !== command.expectedVersion
          ) {
            throw new GovernanceAccessError(
              409,
              "conflict",
              "找不到指定版本的 pending invitation。",
            );
          }
          await requireActiveTargetUser(sql, command.targetUserId);
          if (
            await hasEffectiveAffiliation(sql, command.enterpriseAccountId, command.targetUserId)
          ) {
            throw new GovernanceAccessError(
              409,
              "invalid-transition",
              "使用者已是 Enterprise user。",
            );
          }
          if (direct) {
            await sql.query(
              `UPDATE enterprise_direct_affiliations
               SET status='active',version=version+1,created_at=$3
               WHERE enterprise_account_id=$1 AND user_id=$2`,
              [command.enterpriseAccountId, command.targetUserId, now],
            );
          } else {
            await sql.query(
              `INSERT INTO enterprise_direct_affiliations(
                 enterprise_account_id,user_id,status,version,created_at
               ) VALUES($1,$2,'active',1,$3)`,
              [command.enterpriseAccountId, command.targetUserId, now],
            );
          }
          const changed = (
            await sql.query(
              `UPDATE enterprise_invitations
               SET status='accepted',version=version+1,resolved_at=$3
               WHERE enterprise_account_id=$1 AND user_id=$2 RETURNING version`,
              [command.enterpriseAccountId, command.targetUserId, now],
            )
          ).rows[0]!;
          result = makeReceipt(command, "accepted", changed.version, now);
        } else if (command.action === "decline-invitation") {
          if (
            !invitation ||
            invitation.status !== "pending" ||
            invitation.version !== command.expectedVersion
          ) {
            throw new GovernanceAccessError(
              409,
              "conflict",
              "找不到指定版本的 pending invitation。",
            );
          }
          const changed = (
            await sql.query(
              `UPDATE enterprise_invitations
               SET status='declined',version=version+1,resolved_at=$3
               WHERE enterprise_account_id=$1 AND user_id=$2 RETURNING version`,
              [command.enterpriseAccountId, targetUserId, now],
            )
          ).rows[0]!;
          result = makeReceipt(command, "declined", changed.version, now);
        } else if (command.action === "cancel-invitation") {
          if (
            !invitation ||
            invitation.status !== "pending" ||
            invitation.version !== command.expectedVersion
          ) {
            throw new GovernanceAccessError(
              409,
              "conflict",
              "找不到指定版本的 pending invitation。",
            );
          }
          const changed = (
            await sql.query(
              `UPDATE enterprise_invitations
               SET status='cancelled',version=version+1,resolved_at=$3
               WHERE enterprise_account_id=$1 AND user_id=$2 RETURNING version`,
              [command.enterpriseAccountId, command.targetUserId, now],
            )
          ).rows[0]!;
          result = makeReceipt(command, "cancelled", changed.version, now);
        } else {
          if (
            command.action !== "remove-direct-affiliation" &&
            command.action !== "leave-enterprise"
          ) {
            throw new GovernanceAccessError(
              400,
              "invalid-input",
              "Enterprise 人員移除操作格式不正確。",
            );
          }
          if (!direct || direct.status !== "active" || direct.version !== command.expectedVersion) {
            throw new GovernanceAccessError(
              409,
              "conflict",
              "找不到指定版本的有效 direct affiliation。",
            );
          }
          if (command.action === "leave-enterprise") {
            const otherSource = (
              await sql.query(
                `SELECT 1 FROM enterprise_user_affiliations
                 WHERE enterprise_account_id=$1 AND user_id=$2 AND source_kind<>'direct'
                 LIMIT 1`,
                [command.enterpriseAccountId, targetUserId],
              )
            ).rows[0];
            if (otherSource) {
              throw new GovernanceAccessError(
                409,
                "scope-conflict",
                "仍透過 Organization 隸屬此 Enterprise；請先解除對應 Organization participation。",
              );
            }
          }
          const hasOwner = await hasEnterpriseOwnerAssignment(
            sql,
            command.enterpriseAccountId,
            targetUserId,
          );
          if (
            hasOwner &&
            !(await hasReplacementEnterpriseOwner(sql, command.enterpriseAccountId, targetUserId))
          ) {
            throw new GovernanceAccessError(
              409,
              "last-effective-role-holder",
              "不能移除最後一位有效 EnterpriseOwner 的最後 affiliation。",
            );
          }
          const changed = (
            await sql.query(
              `UPDATE enterprise_direct_affiliations SET status='removed',version=version+1
               WHERE enterprise_account_id=$1 AND user_id=$2 RETURNING version`,
              [command.enterpriseAccountId, targetUserId],
            )
          ).rows[0]!;
          if (hasOwner) {
            await revokeEnterpriseOwnerForAffiliationRemoval(
              sql,
              command.enterpriseAccountId,
              targetUserId,
            );
          }
          result =
            command.action === "leave-enterprise"
              ? {
                  ...makeReceipt(command, "removed", changed.version, now),
                  subjectKind: "user",
                  subjectId: targetUserId,
                }
              : makeReceipt(command, "removed", changed.version, now);
        }
      }

      await recordGovernanceResult(sql, {
        actorUserId: principal.userId,
        actorStatusVersion: principal.userStatusVersion,
        requestId: command.requestId,
        fingerprint,
        action: command.action,
        scopeKind: "enterprise",
        scopeId: command.enterpriseAccountId,
        subjectKind: result.subjectKind,
        subjectId: result.subjectId,
        reason: command.reason,
        at: now,
        result,
      });
      return result;
    });
  }
}
