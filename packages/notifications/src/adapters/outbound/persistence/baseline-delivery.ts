import { randomUUID } from "node:crypto";
import { readUserDeliveryTarget } from "@line_bot_v1/account/postgres";
import type { Database, Sql, SqlRow } from "@line_bot_v1/platform/postgres";
import {
  literalValue,
  nullableString,
  numericValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import { explicitRepositoryRecipient } from "@line_bot_v1/repository/postgres/explicit-recipient";
import type {
  BaselineDeliveryResult,
  BaselineNotification,
} from "../../../contracts/output/baseline-delivery.js";
import type {
  BaselineDeliveryStore,
  DeliveryClaim,
} from "../../../contracts/repositories/baseline-delivery.js";
import { deliveryRetry, lineRetryWindow } from "../../../domain/delivery.js";

function receipt(r: SqlRow) {
  return {
    id: nullableString(r.notification_id),
    cancelled: r.cancelled === true,
    fingerprint: nullableString(r.fingerprint),
  };
}
function delivery(r: SqlRow) {
  return {
    id: stringValue(r.notification_id),
    key: stringValue(r.delivery_key),
    status: literalValue(r.status, ["pending", "sent", "failed", "unknown"]),
    attempts: Number(numericValue(r.attempts)),
    target: nullableString(r.target),
    payload: nullableString(r.payload),
    retryKey: nullableString(r.retry_key),
    first: r.first_attempt_at === null ? null : Number(numericValue(r.first_attempt_at)),
    next: r.available_at === null ? null : Number(numericValue(r.available_at)),
    lease: r.lease_until === null ? null : Number(numericValue(r.lease_until)),
    reason: nullableString(r.reason),
  };
}
const result = (d: ReturnType<typeof delivery>): BaselineDeliveryResult => ({
  inbox: "created",
  notificationId: d.id,
  line:
    d.status === "sent"
      ? "accepted"
      : d.reason === "cancelled"
        ? "cancelled"
        : d.reason === "unavailable"
          ? "unavailable"
          : d.status,
  nextAt: d.next,
});
async function lock(sql: Sql, key: string) {
  await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`notification:${key}`]);
}
async function eligible(sql: Sql, input: BaselineNotification) {
  if (!(await explicitRepositoryRecipient(sql, input.recipient, input.repositoryId))) return false;
  return (
    (
      await sql.query(
        `SELECT 1 FROM notification_repository_source_access
    WHERE source_type='wbs-baseline' AND source_id=$1 AND source_version=$2 AND repository_id=$3 AND user_id=$4`,
        [input.baselineId, input.revisionId, input.repositoryId, input.recipient],
      )
    ).rows.length === 1
  );
}
const skipped = (cancelled = false): BaselineDeliveryResult => ({
  inbox: "skipped",
  notificationId: null,
  line: cancelled ? "cancelled" : "unavailable",
  nextAt: null,
});
export class PostgresBaselineDeliveryStore implements BaselineDeliveryStore {
  constructor(
    private db: Database,
    private provider: string,
  ) {}
  create(input: BaselineNotification, payload: string, now: number) {
    if (!input.key || input.key.length > 300 || !input.recipient || input.recipient.length > 128)
      throw new TypeError("Invalid notification intent.");
    const fingerprint = JSON.stringify({
      repositoryId: input.repositoryId,
      baselineId: input.baselineId,
      revisionId: input.revisionId,
      recipient: input.recipient,
    });
    return this.db.transaction(async (sql) => {
      await lock(sql, input.key);
      const previous = (
        await sql.query(
          "SELECT * FROM notification_receipts WHERE command_key=$1",
          [input.key],
          receipt,
        )
      ).rows[0];
      if (previous?.cancelled) return;
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new Error("Notification intent conflict.");
        return;
      }
      if (!(await eligible(sql, input))) return;
      const target = await readUserDeliveryTarget(sql, input.recipient, this.provider),
        id = randomUUID();
      await sql.query(
        `INSERT INTO notifications(id,recipient,source_type,source_id,source_version,kind,title,body,created_at,version)
        VALUES($1,$2,'wbs-baseline',$3,$4,'system','WBS Baseline published','請開啟來源 Repository 查看正式基準。',$5,1)`,
        [id, input.recipient, input.baselineId, input.revisionId, now],
      );
      await sql.query(
        `INSERT INTO notification_deliveries(notification_id,channel,delivery_key,status,attempts,updated_at,target,payload,retry_key,available_at,reason)
        VALUES($1,'line',$2,$3,0,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          input.key,
          target ? "pending" : "failed",
          now,
          target,
          payload,
          randomUUID(),
          target ? now : null,
          target ? null : "unavailable",
        ],
      );
      await sql.query(
        "INSERT INTO notification_receipts(command_key,fingerprint,notification_id,cancelled) VALUES($1,$2,$3,false)",
        [input.key, fingerprint, id],
      );
    });
  }
  claim(key: string, now: number): ReturnType<BaselineDeliveryStore["claim"]> {
    return this.db.transaction<Awaited<ReturnType<BaselineDeliveryStore["claim"]>>>(async (sql) => {
      await lock(sql, key);
      const prior = (
        await sql.query("SELECT * FROM notification_receipts WHERE command_key=$1", [key], receipt)
      ).rows[0];
      if (!prior?.id) return { result: skipped(prior?.cancelled), claim: null };
      const row = (
        await sql.query(
          `SELECT d.*,n.recipient,n.source_id,n.source_version,a.repository_id FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id
        LEFT JOIN notification_repository_source_access a ON a.source_type=n.source_type AND a.source_id=n.source_id AND a.source_version=n.source_version AND a.user_id=n.recipient
        WHERE d.delivery_key=$1 FOR UPDATE OF d`,
          [key],
        )
      ).rows[0];
      if (!row) throw new Error(`Notification delivery row is missing for key ${key}.`);
      const d = delivery(row);
      if (prior.cancelled) return { result: result(d), claim: null };
      if (d.status === "sent" || d.status === "failed" || d.next === null)
        return { result: result(d), claim: null };
      if (d.lease !== null && d.lease > now)
        return { result: { ...result(d), nextAt: d.lease }, claim: null };
      if (d.next > now) return { result: result(d), claim: null };
      const repositoryId = nullableString(row.repository_id);
      let reason: string | null = null;
      if (
        !repositoryId ||
        !(await eligible(sql, {
          key,
          repositoryId,
          baselineId: stringValue(row.source_id),
          revisionId: stringValue(row.source_version),
          recipient: stringValue(row.recipient),
        }))
      )
        reason = "unavailable";
      else if (
        (await readUserDeliveryTarget(sql, stringValue(row.recipient), this.provider)) !== d.target
      )
        reason = "unavailable";
      if (reason || (d.first !== null && now >= d.first + lineRetryWindow)) {
        // An expired uncertain request stays unknown; never create a new provider retry key.
        const status = d.status === "unknown" ? "unknown" : "failed";
        await sql.query(
          "UPDATE notification_deliveries SET status=$2,reason=$3,available_at=NULL,lease_token=NULL,lease_until=NULL,updated_at=$4 WHERE delivery_key=$1",
          [key, status, reason ?? "retry-window-expired", now],
        );
        return {
          result: {
            ...result(d),
            line: status === "unknown" ? "unknown" : reason ? "unavailable" : status,
            nextAt: null,
          },
          claim: null,
        };
      }
      if (!d.target || !d.payload || !d.retryKey) throw new Error("Missing delivery snapshot.");
      const token = randomUUID();
      await sql.query(
        "UPDATE notification_deliveries SET status='unknown',attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,$2),lease_token=$3,lease_until=$2+60000,updated_at=$2 WHERE delivery_key=$1",
        [key, now, token],
      );
      return {
        result: result(d),
        claim: { token, key, target: d.target, payload: d.payload, retryKey: d.retryKey },
      };
    });
  }
  complete(
    claim: DeliveryClaim,
    outcome: "accepted" | "retry" | "failed" | "unavailable" | "unknown" | "cancelled",
    now: number,
  ) {
    return this.db.transaction<BaselineDeliveryResult>(async (sql) => {
      await lock(sql, claim.key);
      const row = (
        await sql.query(
          "SELECT * FROM notification_deliveries WHERE delivery_key=$1 AND lease_token=$2 AND lease_until>$3 FOR UPDATE",
          [claim.key, claim.token, now],
        )
      ).rows[0];
      if (!row)
        return { inbox: "created", notificationId: null, line: "stale", nextAt: now + 1000 };
      const d = delivery(row),
        status =
          outcome === "accepted"
            ? "sent"
            : outcome === "retry"
              ? "pending"
              : outcome === "unknown"
                ? "unknown"
                : "failed";
      const next =
        outcome === "retry" || outcome === "unknown"
          ? deliveryRetry(d.attempts, now, d.first ?? now)
          : null;
      const finalStatus = outcome === "retry" && next === null ? "failed" : status;
      const reason =
        outcome === "cancelled"
          ? "cancelled"
          : outcome === "unavailable"
            ? "unavailable"
            : (outcome === "retry" || outcome === "unknown") && next === null
              ? "retry-window-expired"
              : null;
      await sql.query(
        "UPDATE notification_deliveries SET status=$2,reason=$3,available_at=$4,lease_token=NULL,lease_until=NULL,updated_at=$5 WHERE delivery_key=$1",
        [claim.key, finalStatus, reason, next, now],
      );
      return { ...result({ ...d, status: finalStatus, next, reason }) };
    });
  }
  cancel(key: string, now: number) {
    return this.db.transaction(async (sql) => {
      await lock(sql, key);
      await sql.query(
        "INSERT INTO notification_receipts(command_key,cancelled) VALUES($1,true) ON CONFLICT(command_key) DO UPDATE SET cancelled=true",
        [key],
      );
      // Already accepted external effects are immutable; pending effects are suppressed.
      await sql.query(
        "UPDATE notification_deliveries SET status=CASE WHEN status='unknown' THEN 'unknown' ELSE 'failed' END,reason=CASE WHEN status='unknown' THEN 'cancelled-in-flight' ELSE 'cancelled' END,available_at=NULL,lease_token=NULL,lease_until=NULL,updated_at=$2 WHERE delivery_key=$1 AND status<>'sent'",
        [key, now],
      );
    });
  }
}
