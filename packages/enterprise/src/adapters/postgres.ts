import type {
  GovernanceQuery,
  VerifiedLineActor,
} from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import {
  governanceFingerprint,
  readGovernanceReplay,
  recordGovernanceResult,
  requireEnterpriseOwner,
  resolveVerifiedLineActor,
} from "@line_bot_v1/identity-access/postgres";
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
import type { EnterpriseIdentityCommand } from "../contracts/output/enterprise-identity.js";
import type { EnterpriseOrganizationCommand } from "../contracts/output/enterprise-organization.js";
import type { EnterpriseOwnerCommand } from "../contracts/output/enterprise-owner.js";
import { detailEnterprise, detailEnterpriseBySlug, listEnterprises } from "./postgres-queries.js";
import { executeEnterpriseTeamMutation } from "./postgres-team-mutations.js";

function enterpriseRow(row: Record<string, unknown>) {
  return {
    account_id: stringValue(row.account_id),
    name: nullableString(row.name),
    slug: nullableString(row.slug),
    status: literalValue(row.status, ["active", "inactive"]),
    version: numberValue(row.version),
  };
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
    command: Exclude<
      EnterpriseCommand,
      | EnterpriseOwnerCommand
      | EnterpriseAffiliationCommand
      | EnterpriseIdentityCommand
      | EnterpriseOrganizationCommand
    >,
    now: number,
  ): Promise<EnterpriseReceipt> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('exclusive')");
      const principal = await resolveVerifiedLineActor(sql, actor);
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${principal.userId}:${command.requestId}`,
      ]);
      const fingerprint = governanceFingerprint(command);

      const enterprise = await lockEnterprise(sql, command.enterpriseAccountId);

      await requireEnterpriseOwner(sql, command.enterpriseAccountId, principal.userId);
      const replay = await readGovernanceReplay(
        sql,
        principal.userId,
        command.requestId,
        fingerprint,
      );
      if (replay) return replay;
      const result = await executeEnterpriseTeamMutation(
        sql,
        enterprise,
        principal.userId,
        command,
        now,
      );

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
