import type {
  GovernanceQuery,
  VerifiedLineActor,
} from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import {
  requireActiveTargetUser,
  requireOrganizationOwner,
  resolveVerifiedLineActor,
} from "@line_bot_v1/identity-access/postgres";
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
import type { OrganizationOwnerCommand } from "../../../application/commands/organization-owner.js";
import type {
  OrganizationCommand,
  OrganizationDetail,
  OrganizationInvitationProjection,
  OrganizationList,
  OrganizationMembershipProjection,
  OrganizationMembershipSource,
  OrganizationReceipt,
} from "../../../contracts/organization-governance.js";
import {
  assertOrganizationMembershipSourceRemovable,
  refreshOrganizationMembershipFromSources,
} from "../../../postgres/membership-sources.js";
import {
  hasOrganizationOwnerAssignment,
  readOrganizationOwnerAssignments,
  readOrganizationOwnerScopeIds,
} from "../../../postgres/owner-roles.js";
import { readOrganizationViewerCapabilities } from "../../../postgres/public.js";
import {
  lockOrganization,
  organizationCommandTransaction,
} from "./organization-governance-transaction.js";

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

function versionRow(row: Record<string, unknown>) {
  return { version: numberValue(row.version) };
}

function provisionedScopeRow(row: Record<string, unknown>) {
  return { scope_version: numberValue(row.scope_version) };
}

function statusVersionRow(row: Record<string, unknown>) {
  return { status: stringValue(row.status), version: numberValue(row.version) };
}

function hasPostgresCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function receipt(
  command: OrganizationCommand,
  status: string,
  version: number,
  at: number,
): OrganizationReceipt {
  const organizationAccountId =
    "organizationAccountId" in command ? command.organizationAccountId : "";
  const userId = "targetUserId" in command ? command.targetUserId : null;
  return {
    requestId: command.requestId,
    action: command.action,
    scopeId: organizationAccountId,
    subjectKind: userId ? "user" : null,
    subjectId: userId,
    status,
    version,
    at,
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

  execute(
    actor: VerifiedLineActor,
    command: Exclude<OrganizationCommand, OrganizationOwnerCommand>,
    now: number,
  ): Promise<OrganizationReceipt> {
    return organizationCommandTransaction(
      this.db,
      actor,
      command.action === "create-organization" ? null : command.organizationAccountId,
      {
        requestId: command.requestId,
        payload: JSON.stringify(command),
        action: command.action,
        reason: command.reason,
        at: now,
      },
      async (sql, evidence) => {
        if (command.action === "create-organization") {
          const replay = await evidence.replay();
          if (replay) return replay;
          const organizationAccountId = crypto.randomUUID();
          let provisioned: Record<string, unknown> | undefined;
          try {
            provisioned = (
              await sql.query(
                "SELECT scope_version FROM app_private.provision_organization_scope($1,$2,$3,$4,$5)",
                [organizationAccountId, evidence.actorUserId, command.login, command.name, now],
                provisionedScopeRow,
              )
            ).rows[0];
          } catch (error) {
            if (hasPostgresCode(error, "23505")) {
              throw new GovernanceAccessError(409, "conflict", "Organization login 已被使用。");
            }
            throw error;
          }
          if (!provisioned)
            throw new GovernanceAccessError(503, "unknown-result", "Organization 建立結果不完整。");
          const result: OrganizationReceipt = {
            requestId: command.requestId,
            action: command.action,
            scopeId: organizationAccountId,
            subjectKind: null,
            subjectId: null,
            status: "active",
            version: Number(provisioned.scope_version),
            at: now,
          };
          await evidence.record(result);
          return result;
        }

        const organization = await lockOrganization(sql, command.organizationAccountId);

        if (command.action === "accept-invitation" || command.action === "decline-invitation") {
          if (command.targetUserId !== evidence.actorUserId) {
            throw new GovernanceAccessError(
              403,
              "forbidden",
              "只能接受自己的 Organization invitation。",
            );
          }
        } else if (command.action !== "leave-organization") {
          await requireOrganizationOwner(sql, command.organizationAccountId, evidence.actorUserId);
        }

        const replay = await evidence.replay();
        if (replay) return replay;

        let result: OrganizationReceipt;
        if (command.action === "update-member-creation-policy") {
          if (organization.status !== "active") {
            throw new GovernanceAccessError(
              409,
              "inactive",
              "停用的 Organization 不能變更成員建立政策。",
            );
          }
          if (organization.version !== command.expectedVersion) {
            throw new GovernanceAccessError(409, "conflict", "Organization 版本已更新。");
          }
          const changed = (
            await sql.query(
              `UPDATE organizations SET
               member_can_create_public_repositories=$2,
               member_can_create_private_repositories=$3,
               member_can_create_internal_repositories=$4,
               member_can_create_project_v2=$5,
               member_can_create_teams=$6,
               version=version+1
             WHERE account_id=$1 RETURNING version`,
              [
                command.organizationAccountId,
                command.memberCanCreatePublicRepositories,
                command.memberCanCreatePrivateRepositories,
                command.memberCanCreateInternalRepositories,
                command.memberCanCreateProjectV2,
                command.memberCanCreateTeams,
              ],
              versionRow,
            )
          ).rows[0];
          if (!changed) {
            throw new GovernanceAccessError(
              409,
              "conflict",
              "Organization 狀態已更新，請重新讀取。",
            );
          }
          result = receipt(command, "active", Number(changed.version), now);
        } else {
          const targetUserId =
            command.action === "leave-organization"
              ? evidence.actorUserId
              : "targetUserId" in command
                ? command.targetUserId
                : null;
          if (!targetUserId) {
            throw new GovernanceAccessError(
              400,
              "invalid-input",
              "Organization 人員操作格式不正確。",
            );
          }
          if (organization.status !== "active") {
            throw new GovernanceAccessError(
              409,
              "inactive",
              "停用的 Organization 不能變更人員關係。",
            );
          }
          const membership = (
            await sql.query(
              `SELECT status,version FROM organization_memberships
             WHERE organization_account_id=$1 AND user_id=$2 FOR UPDATE`,
              [command.organizationAccountId, targetUserId],
              statusVersionRow,
            )
          ).rows[0];
          const directMembership = (
            await sql.query(
              `SELECT status,version FROM organization_direct_memberships
             WHERE organization_account_id=$1 AND user_id=$2 FOR UPDATE`,
              [command.organizationAccountId, targetUserId],
              statusVersionRow,
            )
          ).rows[0];
          const invitation = (
            await sql.query(
              `SELECT status,version FROM organization_invitations
             WHERE organization_account_id=$1 AND user_id=$2 FOR UPDATE`,
              [command.organizationAccountId, targetUserId],
              statusVersionRow,
            )
          ).rows[0];

          if (command.action === "invite-member") {
            if (membership?.status === "active") {
              throw new GovernanceAccessError(
                409,
                "invalid-transition",
                "使用者已是 Organization member。",
              );
            }
            await requireActiveTargetUser(sql, command.targetUserId);
            if (!invitation) {
              if (command.expectedVersion !== 0) {
                throw new GovernanceAccessError(409, "conflict", "Invitation 版本不符。");
              }
              await sql.query(
                `INSERT INTO organization_invitations(
                 organization_account_id,user_id,status,version,created_at,resolved_at
               ) VALUES($1,$2,'pending',1,$3,null)`,
                [command.organizationAccountId, command.targetUserId, now],
              );
              result = receipt(command, "pending", 1, now);
            } else {
              if (
                invitation.version !== command.expectedVersion ||
                invitation.status === "pending"
              ) {
                throw new GovernanceAccessError(409, "conflict", "Invitation 狀態或版本不符。");
              }
              const changed = (
                await sql.query(
                  `UPDATE organization_invitations
                 SET status='pending',version=version+1,created_at=$3,resolved_at=null
                WHERE organization_account_id=$1 AND user_id=$2 RETURNING version`,
                  [command.organizationAccountId, command.targetUserId, now],
                  versionRow,
                )
              ).rows[0];
              if (!changed) {
                throw new GovernanceAccessError(
                  409,
                  "conflict",
                  "Organization 狀態已更新，請重新讀取。",
                );
              }
              result = receipt(command, "pending", changed.version, now);
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
            if (membership?.status === "active") {
              throw new GovernanceAccessError(
                409,
                "invalid-transition",
                "使用者已是 Organization member。",
              );
            }
            if (directMembership) {
              await sql.query(
                `UPDATE organization_direct_memberships
               SET status='active',version=version+1,created_at=$3
               WHERE organization_account_id=$1 AND user_id=$2`,
                [command.organizationAccountId, command.targetUserId, now],
              );
            } else {
              await sql.query(
                `INSERT INTO organization_direct_memberships(
                 organization_account_id,user_id,status,version,created_at
               ) VALUES($1,$2,'active',1,$3)`,
                [command.organizationAccountId, command.targetUserId, now],
              );
            }
            await refreshOrganizationMembershipFromSources(
              sql,
              command.organizationAccountId,
              command.targetUserId,
              now,
            );
            const changed = (
              await sql.query(
                `UPDATE organization_invitations
               SET status='accepted',version=version+1,resolved_at=$3
               WHERE organization_account_id=$1 AND user_id=$2 RETURNING version`,
                [command.organizationAccountId, command.targetUserId, now],
                versionRow,
              )
            ).rows[0];
            if (!changed) {
              throw new GovernanceAccessError(
                409,
                "conflict",
                "Organization 狀態已更新，請重新讀取。",
              );
            }
            result = receipt(command, "accepted", changed.version, now);
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
                `UPDATE organization_invitations
               SET status='declined',version=version+1,resolved_at=$3
               WHERE organization_account_id=$1 AND user_id=$2 RETURNING version`,
                [command.organizationAccountId, targetUserId, now],
                versionRow,
              )
            ).rows[0];
            if (!changed) {
              throw new GovernanceAccessError(
                409,
                "conflict",
                "Organization 狀態已更新，請重新讀取。",
              );
            }
            result = receipt(command, "declined", changed.version, now);
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
                `UPDATE organization_invitations
               SET status='cancelled',version=version+1,resolved_at=$3
               WHERE organization_account_id=$1 AND user_id=$2 RETURNING version`,
                [command.organizationAccountId, command.targetUserId, now],
                versionRow,
              )
            ).rows[0];
            if (!changed) {
              throw new GovernanceAccessError(
                409,
                "conflict",
                "Organization 狀態已更新，請重新讀取。",
              );
            }
            result = receipt(command, "cancelled", changed.version, now);
          } else {
            if (
              command.action !== "remove-direct-membership" &&
              command.action !== "leave-organization"
            ) {
              throw new GovernanceAccessError(
                400,
                "invalid-input",
                "Organization 人員移除操作格式不正確。",
              );
            }
            if (
              !directMembership ||
              directMembership.status !== "active" ||
              directMembership.version !== command.expectedVersion
            ) {
              throw new GovernanceAccessError(
                409,
                "conflict",
                "找不到指定版本的有效 Organization direct membership。",
              );
            }
            if (command.action === "leave-organization") {
              const otherSource = (
                await sql.query(
                  `SELECT 1 FROM organization_membership_sources
                 WHERE organization_account_id=$1 AND user_id=$2 AND source_kind<>'direct'
                 LIMIT 1`,
                  [command.organizationAccountId, targetUserId],
                )
              ).rows[0];
              if (otherSource) {
                throw new GovernanceAccessError(
                  409,
                  "scope-conflict",
                  "仍透過 Enterprise Team 取得此 Organization membership；請先解除該來源。",
                );
              }
            }
            await assertOrganizationMembershipSourceRemovable(
              sql,
              command.organizationAccountId,
              targetUserId,
              "direct",
              command.organizationAccountId,
            );
            const changed = (
              await sql.query(
                `UPDATE organization_direct_memberships
               SET status='removed',version=version+1
               WHERE organization_account_id=$1 AND user_id=$2 RETURNING version`,
                [command.organizationAccountId, targetUserId],
                versionRow,
              )
            ).rows[0];
            if (!changed) {
              throw new GovernanceAccessError(
                409,
                "conflict",
                "Organization 狀態已更新，請重新讀取。",
              );
            }
            await refreshOrganizationMembershipFromSources(
              sql,
              command.organizationAccountId,
              targetUserId,
              now,
            );
            result =
              command.action === "leave-organization"
                ? {
                    ...receipt(command, "removed", changed.version, now),
                    subjectKind: "user",
                    subjectId: targetUserId,
                  }
                : receipt(command, "removed", changed.version, now);
          }
        }

        await evidence.record(result);
        return result;
      },
    );
  }
}
