import { randomUUID } from "node:crypto";
import { requireActiveTargetUser } from "@line_bot_v1/identity-access/postgres";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import {
  assertOrganizationMembershipSourceRemovable,
  cancelPendingOrganizationInvitation,
  readOrganizationQualification,
  refreshOrganizationMembershipFromSources,
} from "@line_bot_v1/organization/adapters/postgres";
import type { Sql } from "@line_bot_v1/platform/postgres";
import type { EnterpriseCommand, EnterpriseReceipt } from "../contracts/enterprise-governance.js";
import { enterpriseTeamSlugFromName } from "../domain.js";
import { makeEnterpriseReceipt } from "./postgres-receipt.js";

type EnterpriseTeamCommand = Extract<
  EnterpriseCommand,
  { action: "create-enterprise-team" } | { teamId: string }
>;

export function isEnterpriseTeamCommand(
  command: EnterpriseCommand,
): command is EnterpriseTeamCommand {
  return command.action === "create-enterprise-team" || "teamId" in command;
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

export async function executeEnterpriseTeamMutation(
  sql: Sql,
  enterprise: { status: "active" | "inactive" },
  actorUserId: string,
  command: EnterpriseTeamCommand,
  now: number,
): Promise<EnterpriseReceipt> {
  let result!: EnterpriseReceipt;
  if (command.action === "create-enterprise-team") {
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
        [teamId, command.enterpriseAccountId, command.name, slug, actorUserId, now],
      );
    } catch (error) {
      const postgres = error as { code?: string; constraint?: string };
      if (postgres.code === "23505" && postgres.constraint === "enterprise_teams_enterprise_slug") {
        throw new GovernanceAccessError(
          409,
          "conflict",
          "此 Enterprise 已有相同 Enterprise Team slug。",
        );
      }
      throw error;
    }
    result = makeEnterpriseReceipt(command, "created", 1, now, teamId);
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
      result = makeEnterpriseReceipt(command, "renamed", changed.version, now);
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
          !(await hasEffectiveAffiliation(sql, command.enterpriseAccountId, command.targetUserId))
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
          throw new GovernanceAccessError(409, "conflict", "Enterprise Team membership 版本不符。");
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
        result = makeEnterpriseReceipt(command, "active", version, now);
      } else {
        if (
          !membership ||
          membership.status !== "active" ||
          membership.version !== command.expectedVersion
        ) {
          throw new GovernanceAccessError(409, "conflict", "Enterprise Team membership 版本不符。");
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
        result = makeEnterpriseReceipt(command, "removed", changed.version, now);
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
          throw new GovernanceAccessError(409, "conflict", "Enterprise Team assignment 版本不符。");
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
        result = makeEnterpriseReceipt(command, "active", version, now);
      } else {
        if (
          !assignment ||
          assignment.status !== "active" ||
          assignment.version !== command.expectedVersion
        ) {
          throw new GovernanceAccessError(409, "conflict", "Enterprise Team assignment 版本不符。");
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
        result = makeEnterpriseReceipt(command, "detached", changed.version, now);
      }
    } else {
      throw new GovernanceAccessError(400, "invalid-input", "Enterprise Team 操作格式不正確。");
    }
  }
  return result;
}
