import { createHash } from "node:crypto";
import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import {
  hasOrganizationOwnerAssignment,
  isOrganizationOwner,
  readGovernanceReplay,
  recordGovernanceResult,
  resolveVerifiedLineActor,
} from "@line_bot_v1/identity-access/postgres";
import type { Database } from "@line_bot_v1/platform/postgres";
import { literalValue, numberValue, stringValue } from "@line_bot_v1/platform/validation";
import type { OrganizationReceipt } from "../../../contracts/organization-governance.js";
import type {
  OrganizationLifecycleTransaction,
  OrganizationLifecycleTransactions,
} from "../../../contracts/output/organization-lifecycle.js";
import type { Organization } from "../../../domain.js";

export class PostgresOrganizationLifecycle implements OrganizationLifecycleTransactions {
  constructor(private readonly db: Database) {}

  transact(
    actor: VerifiedLineActor,
    organizationAccountId: string,
    evidence: { requestId: string; payload: string; reason: string; at: number },
    operation: (transaction: OrganizationLifecycleTransaction) => Promise<OrganizationReceipt>,
  ): Promise<OrganizationReceipt> {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock(71020260912::bigint)");
      const principal = await resolveVerifiedLineActor(sql, actor);
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${principal.userId}:${evidence.requestId}`,
      ]);
      const row = (
        await sql.query(
          "SELECT account_id,status,version FROM organizations WHERE account_id=$1 FOR UPDATE",
          [organizationAccountId],
          (row) => ({
            id: stringValue(row.account_id),
            status: literalValue(row.status, ["active", "inactive"]),
            version: numberValue(row.version),
          }),
        )
      ).rows[0];
      if (!row) throw new GovernanceAccessError(404, "not-found", "找不到 Organization。");
      const current: Organization = row;
      const fingerprint = createHash("sha256").update(evidence.payload).digest("hex");
      const activeOwner = await isOrganizationOwner(sql, current.id, principal.userId);
      const lifecycleOwner = await hasOrganizationOwnerAssignment(
        sql,
        current.id,
        principal.userId,
      );
      return operation({
        ownerQualification: { activeOwner, lifecycleOwner },
        organizations: {
          load: async () => current,
          save: async (next, expectedVersion) => {
            const changed = (
              await sql.query(
                `UPDATE organizations SET status=$2,version=$3
               WHERE account_id=$1 AND version=$4 AND status=$5 RETURNING version`,
                [current.id, next.status, next.version, expectedVersion, current.status],
              )
            ).rows[0];
            if (!changed)
              throw new GovernanceAccessError(
                409,
                "conflict",
                "Organization 狀態已更新，請重新讀取。",
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
            scopeKind: "organization",
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
