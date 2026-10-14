import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { numberValue } from "@line_bot_v1/platform/validation";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type { IssueMetricsQuery } from "../../../contracts/output/metrics.js";
import { IssueError } from "../../../domain.js";

export class PostgresIssueMetrics implements IssueMetricsQuery {
  constructor(private readonly db: Database = businessDatabase()) {}
  read(userId: string, repositoryId: string, from: number, to: number) {
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || from >= to)
      throw new IssueError(400, "Invalid Issue metric interval.");
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId });
      const current = (
        await sql.query(
          `SELECT
        count(*) FILTER(WHERE created_at >= $2 AND created_at < $3)::integer AS created,
        count(*) FILTER(WHERE COALESCE(workflow_status,status)='pending')::integer AS pending,
        count(*) FILTER(WHERE COALESCE(workflow_status,status)='active')::integer AS active,
        count(*) FILTER(WHERE COALESCE(workflow_status,status)='review')::integer AS review,
        count(*) FILTER(WHERE COALESCE(workflow_status,status)='completed')::integer AS completed,
        count(*) FILTER(WHERE state IS NULL)::integer AS legacy
        FROM issues WHERE repository_id=$1`,
          [repositoryId, from, to],
          (r) => ({
            created: numberValue(r.created),
            pending: numberValue(r.pending),
            active: numberValue(r.active),
            review: numberValue(r.review),
            completed: numberValue(r.completed),
            legacy: numberValue(r.legacy),
          }),
        )
      ).rows[0];
      const events = (
        await sql.query(
          `SELECT
        count(*) FILTER(WHERE e.action='close')::integer AS closed,
        count(*) FILTER(WHERE e.action='reopen')::integer AS reopened,
        count(*) FILTER(WHERE e.data='{}'::jsonb)::integer AS unstructured
        FROM issue_events e JOIN issues i ON i.id=e.issue_id
        WHERE i.repository_id=$1 AND e.at >= $2 AND e.at < $3`,
          [repositoryId, from, to],
          (r) => ({
            closed: numberValue(r.closed),
            reopened: numberValue(r.reopened),
            unstructured: numberValue(r.unstructured),
          }),
        )
      ).rows[0];
      if (!current || !events) throw new IssueError(503, "Issue metrics unavailable.");
      return {
        created: current.created,
        closed: events.closed,
        reopened: events.reopened,
        workflow: {
          pending: current.pending,
          active: current.active,
          review: current.review,
          completed: current.completed,
        },
        coverage: {
          stateChanges: "recorded-events-only" as const,
          legacyIssues: current.legacy,
          unstructuredEvents: events.unstructured,
        },
      };
    });
  }
}
