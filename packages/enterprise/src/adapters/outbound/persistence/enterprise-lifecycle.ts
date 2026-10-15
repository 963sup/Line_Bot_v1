import { createHash } from "node:crypto";
import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import {
  hasEnterpriseOwnerAssignment,
  readGovernanceReplay,
  recordGovernanceResult,
  resolveVerifiedLineActor,
} from "@line_bot_v1/identity-access/postgres";
import type { Database } from "@line_bot_v1/platform/postgres";
import { literalValue, numberValue, stringValue } from "@line_bot_v1/platform/validation";
import type { EnterpriseReceipt } from "../../../contracts/enterprise-governance.js";
import type {
  EnterpriseLifecycleTransaction,
  EnterpriseLifecycleTransactions,
} from "../../../contracts/output/enterprise-lifecycle.js";
import type { Enterprise } from "../../../domain.js";

export class PostgresEnterpriseLifecycle implements EnterpriseLifecycleTransactions {
  constructor(private readonly db: Database) {}

  transact(
    actor: VerifiedLineActor,
    enterpriseAccountId: string,
    evidence: { requestId: string; payload: string; reason: string; at: number },
    operation: (transaction: EnterpriseLifecycleTransaction) => Promise<EnterpriseReceipt>,
  ): Promise<EnterpriseReceipt> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT app_private.lock_governance('exclusive')");
      const principal = await resolveVerifiedLineActor(sql, actor);
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${principal.userId}:${evidence.requestId}`,
      ]);
      const row = (
        await sql.query(
          "SELECT account_id,status,version FROM enterprises WHERE account_id=$1 FOR UPDATE",
          [enterpriseAccountId],
          (row) => ({
            id: stringValue(row.account_id),
            status: literalValue(row.status, ["active", "inactive"]),
            version: numberValue(row.version),
          }),
        )
      ).rows[0];
      if (!row) throw new GovernanceAccessError(404, "not-found", "找不到 Enterprise。");
      const current: Enterprise = row;
      const fingerprint = createHash("sha256").update(evidence.payload).digest("hex");
      const lifecycleOwner = await hasEnterpriseOwnerAssignment(sql, current.id, principal.userId);
      return operation({
        ownerQualification: lifecycleOwner,
        enterprises: {
          load: async () => current,
          save: async (next, expectedVersion) => {
            const changed = (
              await sql.query(
                `UPDATE enterprises SET status=$2,version=$3
               WHERE account_id=$1 AND version=$4 AND status=$5 RETURNING version`,
                [current.id, next.status, next.version, expectedVersion, current.status],
              )
            ).rows[0];
            if (!changed)
              throw new GovernanceAccessError(
                409,
                "conflict",
                "Enterprise 狀態已更新，請重新讀取。",
              );
          },
        },
        replay: () => readGovernanceReplay(sql, principal.userId, evidence.requestId, fingerprint),
        record: (result) =>
          recordGovernanceResult(sql, {
            actorUserId: principal.userId,
            actorStatusVersion: principal.userStatusVersion,
            requestId: evidence.requestId,
            fingerprint,
            action: result.action,
            scopeKind: "enterprise",
            scopeId: current.id,
            subjectKind: result.subjectKind,
            subjectId: result.subjectId,
            reason: evidence.reason,
            at: evidence.at,
            result,
          }),
      });
    });
  }
}
