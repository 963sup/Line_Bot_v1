import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import {
  governanceFingerprint,
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
  EnterpriseCommand,
  EnterpriseReceipt,
} from "../../../contracts/enterprise-governance.js";

type TransactionEvidence = {
  actorUserId: string;
  enterpriseStatus: "active" | "inactive";
  replay(): Promise<EnterpriseReceipt | null>;
  record(result: EnterpriseReceipt): Promise<void>;
};

export function enterpriseGovernanceTransaction(
  db: Database,
  actor: VerifiedLineActor,
  command: Extract<EnterpriseCommand, { enterpriseAccountId: string }>,
  at: number,
  operation: (sql: Sql, evidence: TransactionEvidence) => Promise<EnterpriseReceipt>,
): Promise<EnterpriseReceipt> {
  return db.transaction(async (sql) => {
    await sql.query("SELECT app_private.lock_governance('exclusive')");
    const principal = await resolveVerifiedLineActor(sql, actor);
    await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${principal.userId}:${command.requestId}`,
    ]);
    const fingerprint = governanceFingerprint(command);
    const enterprise = (
      await sql.query(
        "SELECT account_id,name,slug,status,version FROM enterprises WHERE account_id=$1 FOR UPDATE",
        [command.enterpriseAccountId],
        (row) => ({
          accountId: stringValue(row.account_id),
          name: nullableString(row.name),
          slug: nullableString(row.slug),
          status: literalValue(row.status, ["active", "inactive"]),
          version: numberValue(row.version),
        }),
      )
    ).rows[0];
    if (!enterprise) throw new GovernanceAccessError(404, "not-found", "找不到 Enterprise。");
    return operation(sql, {
      actorUserId: principal.userId,
      enterpriseStatus: enterprise.status,
      replay: () => readGovernanceReplay(sql, principal.userId, command.requestId, fingerprint),
      record: (result) =>
        recordGovernanceResult(sql, {
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
          at,
          result,
        }),
    });
  });
}
