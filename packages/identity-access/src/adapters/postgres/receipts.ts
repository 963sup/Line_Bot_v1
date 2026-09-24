import { createHash } from "node:crypto";
import type {
  GovernanceReceipt,
  GovernanceSubjectKind,
} from "@line-work/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line-work/identity-access/domain/role-assignment";
import type { Sql } from "@line-work/platform/adapters/postgres";

export function governanceFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function readGovernanceReplay(
  sql: Sql,
  actorUserId: string,
  requestId: string,
  fingerprint: string,
): Promise<GovernanceReceipt | null> {
  const row = (
    await sql.query(
      `SELECT fingerprint,result FROM governance_command_receipts
       WHERE actor_user_id=$1 AND request_id=$2`,
      [actorUserId, requestId],
    )
  ).rows[0];
  if (!row) return null;
  if (row.fingerprint !== fingerprint) {
    throw new GovernanceAccessError(409, "replay-conflict", "請求編號已用於不同操作。");
  }
  return row.result as GovernanceReceipt;
}

export async function recordGovernanceResult(
  sql: Sql,
  input: {
    actorUserId: string;
    actorStatusVersion: number;
    requestId: string;
    fingerprint: string;
    action: string;
    scopeKind: "enterprise" | "organization" | "organization-team";
    scopeId: string;
    subjectKind: GovernanceSubjectKind | null;
    subjectId: string | null;
    reason: string;
    at: number;
    result: GovernanceReceipt;
  },
) {
  await sql.query(
    `INSERT INTO governance_command_receipts(
       actor_user_id,request_id,fingerprint,action,scope_kind,scope_id,
       subject_kind,subject_id,actor_status_version,reason,created_at,result
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      input.actorUserId,
      input.requestId,
      input.fingerprint,
      input.action,
      input.scopeKind,
      input.scopeId,
      input.subjectKind,
      input.subjectId,
      input.actorStatusVersion,
      input.reason,
      input.at,
      JSON.stringify(input.result),
    ],
  );
  await sql.query(
    `INSERT INTO governance_audit_events(
       actor_user_id,actor_status_version,action,scope_kind,scope_id,
       subject_kind,subject_id,reason,request_id,created_at,result
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      input.actorUserId,
      input.actorStatusVersion,
      input.action,
      input.scopeKind,
      input.scopeId,
      input.subjectKind,
      input.subjectId,
      input.reason,
      input.requestId,
      input.at,
      JSON.stringify(input.result),
    ],
  );
}
