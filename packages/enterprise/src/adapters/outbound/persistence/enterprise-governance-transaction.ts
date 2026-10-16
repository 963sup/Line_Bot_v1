import { createHash } from "node:crypto";
import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import {
  readGovernanceReplay,
  recordGovernanceResult,
  resolveVerifiedLineActor,
} from "@line_bot_v1/identity-access/postgres";
import type { Database, Sql } from "@line_bot_v1/platform/postgres";
import {
  literalValue,
  nullableString,
  numberValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import type {
  EnterpriseMutationEvidence,
  EnterpriseReceipt,
} from "../../../contracts/enterprise-governance.js";

type TransactionEvidence = {
  actorUserId: string;
  replay(): Promise<EnterpriseReceipt | null>;
  record(result: EnterpriseReceipt): Promise<void>;
};

export function enterpriseCommandTransaction(
  db: Database,
  actor: VerifiedLineActor,
  scopeId: string | null,
  audit: EnterpriseMutationEvidence,
  operation: (sql: Sql, evidence: TransactionEvidence) => Promise<EnterpriseReceipt>,
): Promise<EnterpriseReceipt> {
  return db.transaction(async (sql) => {
    await sql.query("SELECT app_private.lock_governance('exclusive')");
    const principal = await resolveVerifiedLineActor(sql, actor);
    await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${principal.userId}:${audit.requestId}`,
    ]);
    const fingerprint = createHash("sha256").update(audit.payload).digest("hex");
    return operation(sql, {
      actorUserId: principal.userId,
      replay: () => readGovernanceReplay(sql, principal.userId, audit.requestId, fingerprint),
      record: (result) =>
        recordGovernanceResult(sql, {
          actorUserId: principal.userId,
          actorStatusVersion: principal.userStatusVersion,
          requestId: audit.requestId,
          fingerprint,
          action: audit.action,
          scopeKind: "enterprise",
          scopeId: scopeId ?? result.scopeId,
          subjectKind: result.subjectKind,
          subjectId: result.subjectId,
          reason: audit.reason,
          at: audit.at,
          result,
        }),
    });
  });
}

type StoredEnterprise = {
  id: string;
  name: string | null;
  slug: string | null;
  status: "active" | "inactive";
  version: number;
};

export function enterpriseGovernanceTransaction(
  db: Database,
  actor: VerifiedLineActor,
  scopeId: string,
  audit: EnterpriseMutationEvidence,
  operation: (
    sql: Sql,
    evidence: TransactionEvidence & { enterpriseStatus: "active" | "inactive" },
    current: StoredEnterprise,
  ) => Promise<EnterpriseReceipt>,
): Promise<EnterpriseReceipt> {
  return enterpriseCommandTransaction(db, actor, scopeId, audit, async (sql, evidence) => {
    const enterprise = (
      await sql.query(
        "SELECT account_id,name,slug,status,version FROM enterprises WHERE account_id=$1 FOR UPDATE",
        [scopeId],
        (row) => ({
          id: stringValue(row.account_id),
          name: nullableString(row.name),
          slug: nullableString(row.slug),
          status: literalValue(row.status, ["active", "inactive"]),
          version: numberValue(row.version),
        }),
      )
    ).rows[0];
    if (!enterprise) throw new GovernanceAccessError(404, "not-found", "找不到 Enterprise。");
    return operation(sql, { ...evidence, enterpriseStatus: enterprise.status }, enterprise);
  });
}
