import { createHash } from "node:crypto";
import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import {
  readGovernanceReplay,
  recordGovernanceResult,
  resolveVerifiedLineActor,
} from "@line_bot_v1/identity-access/postgres";
import type { Database, Sql } from "@line_bot_v1/platform/postgres";
import { literalValue, numberValue, stringValue } from "@line_bot_v1/platform/validation";
import type {
  OrganizationMutationEvidence,
  OrganizationReceipt,
} from "../../../contracts/organization-governance.js";
import type { Organization } from "../../../domain.js";

type TransactionEvidence = {
  actorUserId: string;
  replay(): Promise<OrganizationReceipt | null>;
  record(result: OrganizationReceipt): Promise<void>;
};

export function organizationCommandTransaction(
  db: Database,
  actor: VerifiedLineActor,
  organizationAccountId: string | null,
  mutation: OrganizationMutationEvidence,
  operation: (sql: Sql, evidence: TransactionEvidence) => Promise<OrganizationReceipt>,
) {
  return db.transaction(async (sql) => {
    await sql.query("SELECT app_private.lock_governance('exclusive')");
    const principal = await resolveVerifiedLineActor(sql, actor);
    await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${principal.userId}:${mutation.requestId}`,
    ]);
    const fingerprint = createHash("sha256").update(mutation.payload).digest("hex");
    let replayFingerprint: string | readonly string[] = fingerprint;
    if (mutation.legacyPayload !== undefined) {
      const legacy = createHash("sha256").update(mutation.legacyPayload).digest("hex");
      replayFingerprint = [fingerprint, legacy];
    }
    return operation(sql, {
      actorUserId: principal.userId,
      replay: () =>
        readGovernanceReplay(sql, principal.userId, mutation.requestId, replayFingerprint),
      record: (result) =>
        recordGovernanceResult(sql, {
          actorUserId: principal.userId,
          actorStatusVersion: principal.userStatusVersion,
          requestId: mutation.requestId,
          fingerprint,
          action: mutation.action,
          scopeKind: "organization",
          scopeId: organizationAccountId ?? result.scopeId,
          subjectKind: result.subjectKind,
          subjectId: result.subjectId,
          reason: mutation.reason,
          at: mutation.at,
          result,
        }),
    });
  });
}

export async function lockOrganization(
  sql: Sql,
  organizationAccountId: string,
): Promise<Organization> {
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
  return row;
}

export function organizationGovernanceTransaction(
  db: Database,
  actor: VerifiedLineActor,
  organizationAccountId: string,
  mutation: OrganizationMutationEvidence,
  operation: (
    sql: Sql,
    evidence: TransactionEvidence,
    organization: Organization,
  ) => Promise<OrganizationReceipt>,
) {
  return organizationCommandTransaction(
    db,
    actor,
    organizationAccountId,
    mutation,
    async (sql, evidence) =>
      operation(sql, evidence, await lockOrganization(sql, organizationAccountId)),
  );
}
