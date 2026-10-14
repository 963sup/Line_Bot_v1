import { randomUUID } from "node:crypto";
import type { Database, Sql } from "@line_bot_v1/platform/postgres";
import { numericValue, stringValue } from "@line_bot_v1/platform/validation";
import type { WbsBaselineEvents } from "../../../contracts/output/baseline-events.js";

/** Called under the Repository lock when a rule enables its future-event delegation. */
async function wbsEventCursor(sql: Sql, repositoryId: string) {
  const row = (
    await sql.query(
      "SELECT COALESCE(max(event_no),0) AS n FROM repository_wbs_outbox WHERE repository_id=$1",
      [repositoryId],
      (r) => ({ n: Number(numericValue(r.n)) }),
    )
  ).rows[0];
  return row?.n ?? 0;
}
export class PostgresWbsBaselineEvents implements WbsBaselineEvents {
  constructor(private db: Database) {}
  cursor(repositoryId: string) {
    return this.db.transaction((sql) => wbsEventCursor(sql, repositoryId));
  }
  claim(now: number) {
    return this.db.transaction(async (sql) => {
      const token = randomUUID();
      return (
        (
          await sql.query(
            `UPDATE repository_wbs_outbox SET lease_token=$2,lease_until=$1+60000
        WHERE id=(SELECT id FROM repository_wbs_outbox WHERE acknowledged_at IS NULL
        AND (lease_until IS NULL OR lease_until<=$1) ORDER BY event_no FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING *`,
            [now, token],
            (r) => ({
              id: stringValue(r.id),
              cursor: Number(numericValue(r.event_no)),
              repositoryId: stringValue(r.repository_id),
              baselineId: stringValue(r.baseline_id),
              revisionId: stringValue(r.revision_id),
              at: Number(numericValue(r.at)),
              leaseToken: token,
            }),
          )
        ).rows[0] ?? null
      );
    });
  }
  acknowledge(event: { id: string; leaseToken: string }, now: number) {
    return this.db.transaction(
      async (sql) =>
        (
          await sql.query(
            "UPDATE repository_wbs_outbox SET acknowledged_at=$3,lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2 AND lease_until>$3 AND acknowledged_at IS NULL RETURNING id",
            [event.id, event.leaseToken, now],
          )
        ).rows.length === 1,
    );
  }
}
