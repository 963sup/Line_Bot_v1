import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import type {
  GovernanceAuditEvent,
  GovernanceAuditQuery,
  GovernanceAuditReader,
} from "../../contracts/audit.js";
import type { VerifiedLineActor } from "../../contracts/governance.js";
import { GovernanceAccessError } from "../../domain/role-assignment.js";
import { resolveVerifiedLineActor } from "../../postgres/actor.js";
import {
  requireEnterpriseOwner,
  requireOrganizationOwner,
} from "../../postgres/typed-role-assignments.js";

export class PostgresGovernanceAuditReader implements GovernanceAuditReader {
  constructor(private readonly db?: Database) {}

  read(actor: VerifiedLineActor, query: GovernanceAuditQuery): Promise<GovernanceAuditEvent[]> {
    return (this.db ?? businessDatabase()).transaction(async (sql) => {
      const { userId } = await resolveVerifiedLineActor(sql, actor);
      if (query.scopeKind === "enterprise")
        await requireEnterpriseOwner(sql, query.scopeId, userId);
      else if (query.scopeKind === "organization")
        await requireOrganizationOwner(sql, query.scopeId, userId);
      else throw new GovernanceAccessError(403, "forbidden", "不支援此稽核範圍。");
      const rows = (
        await sql.query(
          `SELECT id::text,actor_user_id,action,scope_kind,scope_id,subject_kind,subject_id,
                request_id,created_at,result->>'status' AS outcome,result->>'version' AS version
         FROM governance_audit_events
         WHERE scope_kind=$1 AND scope_id=$2
           AND ($3::bigint IS NULL OR (created_at,id)<($3::bigint,$4::bigint))
         ORDER BY created_at DESC,governance_audit_events.id DESC LIMIT $5`,
          [
            query.scopeKind,
            query.scopeId,
            query.before?.at ?? null,
            query.before?.id ?? null,
            Math.min(101, Math.max(1, query.limit)),
          ],
        )
      ).rows;
      return rows.map((row) => ({
        id: String(row.id),
        actorUserId: row.actor_user_id,
        action: row.action,
        scopeKind: row.scope_kind,
        scopeId: row.scope_id,
        subjectKind: row.subject_kind,
        subjectId: row.subject_id,
        requestId: row.request_id,
        occurredAt: Number(row.created_at),
        outcome: row.outcome,
        version: Number(row.version),
      }));
    });
  }
}
