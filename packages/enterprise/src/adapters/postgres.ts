import { randomUUID } from "node:crypto";
import type {
  GovernanceQuery,
  VerifiedLineActor,
} from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import {
  governanceFingerprint,
  hasOrganizationOwnerAssignment,
  isOrganizationOwner,
  readGovernanceReplay,
  recordGovernanceResult,
  requireEnterpriseLifecycleOwner,
  requireEnterpriseOwner,
  resolveVerifiedLineActor,
} from "@line_bot_v1/identity-access/postgres";
import { readOrganizationQualification } from "@line_bot_v1/organization/postgres";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import {
  literalValue,
  nullableString,
  numberValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import type {
  EnterpriseCommand,
  EnterpriseDetail,
  EnterpriseList,
  EnterpriseReceipt,
} from "../contracts/enterprise-governance.js";
import type { EnterpriseAffiliationCommand } from "../contracts/output/enterprise-affiliation.js";
import type { EnterpriseOwnerCommand } from "../contracts/output/enterprise-owner.js";
import { detailEnterprise, detailEnterpriseBySlug, listEnterprises } from "./postgres-queries.js";
import { makeEnterpriseReceipt } from "./postgres-receipt.js";
import {
  executeEnterpriseTeamMutation,
  isEnterpriseTeamCommand,
} from "./postgres-team-mutations.js";

function enterpriseRow(row: Record<string, unknown>) {
  return {
    account_id: stringValue(row.account_id),
    name: nullableString(row.name),
    slug: nullableString(row.slug),
    status: literalValue(row.status, ["active", "inactive"]),
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

async function lockEnterprise(sql: Sql, id: string) {
  const row = (
    await sql.query(
      "SELECT account_id,name,slug,status,version FROM enterprises WHERE account_id=$1 FOR UPDATE",
      [id],
      enterpriseRow,
    )
  ).rows[0];
  if (!row) throw new GovernanceAccessError(404, "not-found", "找不到 Enterprise。");
  return row;
}

export class PostgresEnterpriseGovernance {
  constructor(private readonly db: Database = businessDatabase()) {}

  list(actor: VerifiedLineActor, query: GovernanceQuery): Promise<EnterpriseList> {
    return listEnterprises(this.db, actor, query);
  }

  detailBySlug(actor: VerifiedLineActor, slug: string): Promise<EnterpriseDetail> {
    return detailEnterpriseBySlug(this.db, actor, slug);
  }

  detail(actor: VerifiedLineActor, enterpriseAccountId: string): Promise<EnterpriseDetail> {
    return detailEnterprise(this.db, actor, enterpriseAccountId);
  }

  execute(
    actor: VerifiedLineActor,
    command: Exclude<EnterpriseCommand, EnterpriseOwnerCommand | EnterpriseAffiliationCommand>,
    now: number,
  ): Promise<EnterpriseReceipt> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('exclusive')");
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
              provisionedScopeRow,
            )
          ).rows[0];
        } catch (error) {
          if (hasPostgresCode(error, "23505")) {
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

      if (command.action === "complete-enterprise-identity") {
        await requireEnterpriseOwner(sql, command.enterpriseAccountId, principal.userId);
        const replay = await readGovernanceReplay(
          sql,
          principal.userId,
          command.requestId,
          fingerprint,
        );
        if (replay) return replay;
        if (enterprise.version !== command.expectedVersion) {
          throw new GovernanceAccessError(409, "conflict", "Enterprise 版本已更新。");
        }
        if (enterprise.name !== null || enterprise.slug !== null) {
          throw new GovernanceAccessError(
            409,
            "invalid-transition",
            "Enterprise identity 已完成，不能再次以 recovery command 修改。",
          );
        }
        let changed: Record<string, unknown> | undefined;
        try {
          changed = (
            await sql.query(
              `UPDATE enterprises
               SET name=$2,slug=$3,version=version+1
               WHERE account_id=$1 AND name IS NULL AND slug IS NULL
              RETURNING version`,
              [command.enterpriseAccountId, command.name, command.slug],
              versionRow,
            )
          ).rows[0];
        } catch (error) {
          if (hasPostgresCode(error, "23505")) {
            throw new GovernanceAccessError(409, "conflict", "Enterprise slug 已被使用。");
          }
          throw error;
        }
        if (!changed) {
          throw new GovernanceAccessError(
            409,
            "conflict",
            "Enterprise identity 已被其他操作完成，請重新載入。",
          );
        }
        const result: EnterpriseReceipt = {
          requestId: command.requestId,
          action: command.action,
          scopeId: command.enterpriseAccountId,
          subjectKind: null,
          subjectId: null,
          status: enterprise.status,
          version: Number(changed.version),
          at: now,
        };
        await recordGovernanceResult(sql, {
          actorUserId: principal.userId,
          actorStatusVersion: principal.userStatusVersion,
          requestId: command.requestId,
          fingerprint,
          action: command.action,
          scopeKind: "enterprise",
          scopeId: command.enterpriseAccountId,
          subjectKind: null,
          subjectId: null,
          reason: command.reason,
          at: now,
          result,
        });
        return result;
      }

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
      } else {
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
      if (command.action === "attach-organization" || command.action === "detach-organization") {
        if (!organization) {
          throw new GovernanceAccessError(404, "not-found", "找不到 Organization。");
        }
        if (
          enterprise.version !== command.expectedEnterpriseVersion ||
          organization.version !== command.expectedOrganizationVersion
        ) {
          throw new GovernanceAccessError(
            409,
            "conflict",
            "Enterprise 或 Organization 版本已更新。",
          );
        }
        if (
          command.action === "attach-organization" &&
          (enterprise.status !== "active" || organization.status !== "active")
        ) {
          throw new GovernanceAccessError(409, "inactive", "停用的範圍不能建立治理關係。");
        }
        const relation = (
          await sql.query(
            `SELECT status,version FROM enterprise_organizations
             WHERE enterprise_account_id=$1 AND organization_account_id=$2 FOR UPDATE`,
            [command.enterpriseAccountId, command.organizationAccountId],
            statusVersionRow,
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
              if (hasPostgresCode(error, "23505"))
                throw new GovernanceAccessError(
                  409,
                  "scope-conflict",
                  "Organization 已由其他 Enterprise 治理。",
                );
              throw error;
            }
            result = makeEnterpriseReceipt(command, "active", 1, now);
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
                  versionRow,
                )
              ).rows[0];
              if (!changed) {
                throw new GovernanceAccessError(
                  409,
                  "conflict",
                  "Enterprise 狀態已更新，請重新讀取。",
                );
              }
              result = makeEnterpriseReceipt(command, "active", changed.version, now);
            } catch (error) {
              if (hasPostgresCode(error, "23505"))
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
              versionRow,
            )
          ).rows[0];
          if (!changed) {
            throw new GovernanceAccessError(409, "conflict", "Enterprise 狀態已更新，請重新讀取。");
          }
          result = makeEnterpriseReceipt(command, "detached", changed.version, now);
        }
      } else if (isEnterpriseTeamCommand(command)) {
        result = await executeEnterpriseTeamMutation(
          sql,
          enterprise,
          principal.userId,
          command,
          now,
        );
      } else {
        throw new GovernanceAccessError(400, "invalid-input", "Enterprise 人員操作格式不正確。");
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
