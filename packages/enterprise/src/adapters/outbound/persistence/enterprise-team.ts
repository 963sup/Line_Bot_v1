import { randomUUID } from "node:crypto";
import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import {
  requireActiveTargetUser,
  requireEnterpriseOwner,
} from "@line_bot_v1/identity-access/postgres";
import { NamespaceError } from "@line_bot_v1/namespace";
import { claimScopedName, renameScopedName } from "@line_bot_v1/namespace/postgres";
import {
  assertOrganizationMembershipSourceRemovable,
  cancelPendingOrganizationInvitation,
  readOrganizationQualification,
  refreshOrganizationMembershipFromSources,
} from "@line_bot_v1/organization/postgres";
import type { Database } from "@line_bot_v1/platform/postgres";
import { literalValue, numberValue, stringValue } from "@line_bot_v1/platform/validation";
import type {
  EnterpriseMutationEvidence,
  EnterpriseReceipt,
} from "../../../contracts/enterprise-governance.js";
import type {
  EnterpriseTeamTransaction,
  EnterpriseTeamTransactions,
} from "../../../contracts/output/enterprise-team.js";
import { enterpriseGovernanceTransaction } from "./enterprise-governance-transaction.js";

function versionRow(row: Record<string, unknown>) {
  return { version: numberValue(row.version) };
}

export class PostgresEnterpriseTeam implements EnterpriseTeamTransactions {
  constructor(private readonly db: Database) {}

  transact(
    actor: VerifiedLineActor,
    scopeId: string,
    audit: EnterpriseMutationEvidence,
    operation: (transaction: EnterpriseTeamTransaction) => Promise<EnterpriseReceipt>,
  ): Promise<EnterpriseReceipt> {
    const at = audit.at;
    return enterpriseGovernanceTransaction(this.db, actor, scopeId, audit, async (sql, evidence) =>
      operation({
        enterpriseStatus: evidence.enterpriseStatus,
        replay: evidence.replay,
        record: evidence.record,
        nextId: randomUUID,
        authorize: () => requireEnterpriseOwner(sql, scopeId, evidence.actorUserId),
        loadTeam: async (teamId) =>
          (
            await sql.query(
              `SELECT id,name,slug,version FROM enterprise_teams
         WHERE enterprise_account_id=$1 AND id=$2 FOR UPDATE`,
              [scopeId, teamId],
              (row) => ({
                id: stringValue(row.id),
                enterpriseAccountId: scopeId,
                name: stringValue(row.name),
                slug: stringValue(row.slug),
                version: numberValue(row.version),
              }),
            )
          ).rows[0] ?? null,
        saveTeam: async (team, expectedSlug) => {
          try {
            if (team.version === 1) {
              await claimScopedName(sql, {
                family: "enterprise-team-slug",
                scopeKind: "ENTERPRISE",
                scopeId,
                targetKind: "ENTERPRISE_TEAM",
                targetId: team.id,
                name: team.slug,
                at,
              });
              await sql.query(
                `INSERT INTO enterprise_teams(
              id,enterprise_account_id,name,slug,version,created_by_user_id,created_at
            ) VALUES($1,$2,$3,$4,1,$5,$6)`,
                [team.id, scopeId, team.name, team.slug, evidence.actorUserId, at],
              );
              return 1;
            }
            if (expectedSlug === undefined)
              throw new GovernanceAccessError(
                503,
                "unknown-result",
                "Enterprise Team rename 缺少目前 slug。",
              );
            await renameScopedName(sql, {
              family: "enterprise-team-slug",
              scopeKind: "ENTERPRISE",
              scopeId,
              targetKind: "ENTERPRISE_TEAM",
              targetId: team.id,
              expectedName: expectedSlug,
              name: team.slug,
              at,
            });
            const row = (
              await sql.query(
                `UPDATE enterprise_teams
             SET name=$3,slug=$4,version=version+1
             WHERE enterprise_account_id=$1 AND id=$2 RETURNING version`,
                [scopeId, team.id, team.name, team.slug],
                versionRow,
              )
            ).rows[0];
            if (!row)
              throw new GovernanceAccessError(
                503,
                "unknown-result",
                "Enterprise Team 更新結果不完整。",
              );
            return row.version;
          } catch (error) {
            if (
              (error instanceof NamespaceError && error.status === 409) ||
              (error instanceof Error &&
                "code" in error &&
                error.code === "23505" &&
                "constraint" in error &&
                error.constraint === "enterprise_teams_enterprise_slug")
            )
              throw new GovernanceAccessError(
                409,
                "conflict",
                "此 Enterprise 已有相同 Enterprise Team slug。",
              );
            throw error;
          }
        },
        loadMembership: async (teamId, userId) =>
          (
            await sql.query(
              `SELECT status,version FROM enterprise_team_memberships
         WHERE enterprise_account_id=$1 AND team_id=$2 AND user_id=$3 FOR UPDATE`,
              [scopeId, teamId, userId],
              (row) => ({
                teamId,
                enterpriseAccountId: scopeId,
                userId,
                status: literalValue(row.status, ["active", "removed"]),
                version: numberValue(row.version),
              }),
            )
          ).rows[0] ?? null,
        requireActiveTarget: async (userId) => {
          await requireActiveTargetUser(sql, userId);
        },
        isAffiliated: async (userId) =>
          Boolean(
            (
              await sql.query(
                `SELECT 1 FROM enterprise_user_affiliations
         WHERE enterprise_account_id=$1 AND user_id=$2 LIMIT 1`,
                [scopeId, userId],
              )
            ).rows[0],
          ),
        saveMembership: async (membership) => {
          const values = [scopeId, membership.teamId, membership.userId];
          if (membership.version === 1) {
            await sql.query(
              `INSERT INTO enterprise_team_memberships(
             team_id,enterprise_account_id,user_id,status,version,joined_at
           ) VALUES($1,$2,$3,'active',1,$4)`,
              [membership.teamId, scopeId, membership.userId, at],
            );
            return 1;
          }
          const query =
            membership.status === "active"
              ? `UPDATE enterprise_team_memberships
               SET status='active',version=version+1,joined_at=$4
               WHERE enterprise_account_id=$1 AND team_id=$2 AND user_id=$3 RETURNING version`
              : `UPDATE enterprise_team_memberships SET status='removed',version=version+1
               WHERE enterprise_account_id=$1 AND team_id=$2 AND user_id=$3 RETURNING version`;
          const row = (
            await sql.query(
              query,
              membership.status === "active" ? [...values, at] : values,
              versionRow,
            )
          ).rows[0];
          if (!row)
            throw new GovernanceAccessError(409, "conflict", "Enterprise Team membership 已更新。");
          return row.version;
        },
        organizationScope: async (organizationId) => {
          const relation = (
            await sql.query(
              `SELECT version FROM enterprise_organizations
          WHERE enterprise_account_id=$1 AND organization_account_id=$2 AND status='active'
          FOR SHARE`,
              [scopeId, organizationId],
            )
          ).rows[0];
          const organization = await readOrganizationQualification(sql, organizationId, "share");
          return { attached: Boolean(relation), status: organization?.status ?? null };
        },
        loadAssignment: async (teamId, organizationId) =>
          (
            await sql.query(
              `SELECT status,version FROM enterprise_team_organizations
         WHERE enterprise_account_id=$1 AND team_id=$2 AND organization_account_id=$3 FOR UPDATE`,
              [scopeId, teamId, organizationId],
              (row) => ({
                teamId,
                enterpriseAccountId: scopeId,
                organizationAccountId: organizationId,
                status: literalValue(row.status, ["active", "detached"]),
                version: numberValue(row.version),
              }),
            )
          ).rows[0] ?? null,
        saveAssignment: async (assignment) => {
          const values = [scopeId, assignment.teamId, assignment.organizationAccountId];
          if (assignment.version === 1) {
            await sql.query(
              `INSERT INTO enterprise_team_organizations(
             team_id,enterprise_account_id,organization_account_id,status,version,assigned_at,detached_at
           ) VALUES($1,$2,$3,'active',1,$4,null)`,
              [assignment.teamId, scopeId, assignment.organizationAccountId, at],
            );
            return 1;
          }
          const query =
            assignment.status === "active"
              ? `UPDATE enterprise_team_organizations
               SET status='active',version=version+1,assigned_at=$4,detached_at=null
               WHERE enterprise_account_id=$1 AND team_id=$2 AND organization_account_id=$3 RETURNING version`
              : `UPDATE enterprise_team_organizations
               SET status='detached',version=version+1,detached_at=$4
               WHERE enterprise_account_id=$1 AND team_id=$2 AND organization_account_id=$3 RETURNING version`;
          const row = (await sql.query(query, [...values, at], versionRow)).rows[0];
          if (!row)
            throw new GovernanceAccessError(409, "conflict", "Enterprise Team assignment 已更新。");
          return row.version;
        },
        organizationIds: async (teamId) =>
          (
            await sql.query(
              `SELECT organization_account_id FROM enterprise_team_organizations
         WHERE enterprise_account_id=$1 AND team_id=$2 AND status='active'
         ORDER BY organization_account_id FOR SHARE`,
              [scopeId, teamId],
              (row) => ({ id: stringValue(row.organization_account_id) }),
            )
          ).rows.map((row) => row.id),
        memberIds: async (teamId) =>
          (
            await sql.query(
              `SELECT user_id FROM enterprise_team_memberships
         WHERE enterprise_account_id=$1 AND team_id=$2 AND status='active'
         ORDER BY user_id FOR SHARE`,
              [scopeId, teamId],
              (row) => ({ id: stringValue(row.user_id) }),
            )
          ).rows.map((row) => row.id),
        assertSourceRemovable: (organizationId, userId, teamId, affectedUserIds) =>
          assertOrganizationMembershipSourceRemovable(
            sql,
            organizationId,
            userId,
            "enterprise-team",
            teamId,
            affectedUserIds,
          ),
        refreshMembership: async (organizationId, userId) => {
          await refreshOrganizationMembershipFromSources(sql, organizationId, userId, at);
        },
        cancelInvitation: (organizationId, userId) =>
          cancelPendingOrganizationInvitation(sql, organizationId, userId, at),
      }),
    );
  }
}
