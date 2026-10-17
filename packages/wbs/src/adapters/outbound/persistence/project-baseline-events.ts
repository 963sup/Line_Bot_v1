import { randomUUID } from "node:crypto";
import type { Database, Sql } from "@line_bot_v1/platform/postgres";
import { numericValue, stringValue } from "@line_bot_v1/platform/validation";
import type { ProjectWbsBaselineEvents } from "../../../contracts/output/project-baseline-events.js";

/** Called under the Project lock when a rule enables its future-event delegation. */
async function wbsEventCursor(sql: Sql, projectId: string) {
  const row = (
    await sql.query(
      "SELECT COALESCE(max(event_no),0) AS n FROM project_wbs_outbox WHERE project_id=$1",
      [projectId],
      (r) => ({ n: Number(numericValue(r.n)) }),
    )
  ).rows[0];
  return row?.n ?? 0;
}
export class PostgresProjectWbsBaselineEvents implements ProjectWbsBaselineEvents {
  constructor(private db: Database) {}
  cursor(projectId: string) {
    return this.db.transaction((sql) => wbsEventCursor(sql, projectId));
  }
  claim(now: number) {
    return this.db.transaction(async (sql) => {
      const token = randomUUID();
      return (
        (
          await sql.query(
            `UPDATE project_wbs_outbox SET lease_token=$2,lease_until=$1+60000
        WHERE id=(SELECT id FROM project_wbs_outbox WHERE acknowledged_at IS NULL
        AND (lease_until IS NULL OR lease_until<=$1) ORDER BY event_no FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING *`,
            [now, token],
            (r) => ({
              id: stringValue(r.id),
              cursor: Number(numericValue(r.event_no)),
              projectId: stringValue(r.project_id),
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
            "UPDATE project_wbs_outbox SET acknowledged_at=$3,lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2 AND lease_until>$3 AND acknowledged_at IS NULL RETURNING id",
            [event.id, event.leaseToken, now],
          )
        ).rows.length === 1,
    );
  }
}
