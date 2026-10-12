import { createHash } from "node:crypto";
import type { Sql } from "@line_bot_v1/platform/postgres";
import {
  literalValue,
  nullableString,
  numberValue,
  record,
  stringValue,
} from "@line_bot_v1/platform/validation";
import type { GovernanceReceipt, GovernanceSubjectKind } from "../contracts/governance.js";
import { GovernanceAccessError } from "../domain/role-assignment.js";

export function governanceFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function governanceReceipt(value: unknown): GovernanceReceipt {
  const result = record(value);
  return {
    requestId: stringValue(result.requestId),
    action: stringValue(result.action),
    scopeId: stringValue(result.scopeId),
    subjectKind:
      result.subjectKind === null
        ? null
        : literalValue(result.subjectKind, [
            "user",
            "organization",
            "organization-team",
            "enterprise-team",
          ]),
    subjectId: nullableString(result.subjectId),
    status: stringValue(result.status),
    version: numberValue(result.version),
    at: numberValue(result.at),
  };
}

function governanceReplayRow(row: Record<string, unknown>) {
  return { fingerprint: stringValue(row.fingerprint), result: governanceReceipt(row.result) };
}

export async function readGovernanceReplay(
  sql: Sql,
  actorUserId: string,
  requestId: string,
  fingerprint: string | readonly string[],
): Promise<GovernanceReceipt | null> {
  const row = (
    await sql.query(
      `SELECT fingerprint,result FROM governance_command_receipts
      WHERE actor_user_id=$1 AND request_id=$2`,
      [actorUserId, requestId],
      governanceReplayRow,
    )
  ).rows[0];
  if (!row) return null;
  const accepted = Array.isArray(fingerprint) ? fingerprint : [fingerprint];
  if (!accepted.includes(row.fingerprint)) {
    throw new GovernanceAccessError(409, "replay-conflict", "請求編號已用於不同操作。");
  }
  return row.result;
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
