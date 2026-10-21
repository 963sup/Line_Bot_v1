import { createHash, randomUUID } from "node:crypto";
import type { ContentPlanReferenceReader } from "@line_bot_v1/content/contracts/output/plan-references";
import {
  businessDatabase,
  type Database,
  type Sql,
  type SqlRow,
} from "@line_bot_v1/platform/postgres";
import { numberValue, numericValue, record, stringValue } from "@line_bot_v1/platform/validation";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type {
  TaskDependencyReads,
  TaskDependencyTransaction,
  TaskDependencyTransactions,
} from "../../../contracts/output/task-dependencies.js";
import { ExecutionError } from "../../../domain/error.js";
import type {
  TaskDependencyEdge,
  TaskDependencyRevision,
} from "../../../domain/task-dependencies.js";

function edgesValue(value: unknown): TaskDependencyEdge[] {
  if (!Array.isArray(value)) throw new TypeError("Expected Task dependency edges");
  return value.map((item) => {
    const edge = record(item);
    return {
      taskId: stringValue(edge.taskId),
      prerequisiteTaskId: stringValue(edge.prerequisiteTaskId),
    };
  });
}

function decode(row: SqlRow): TaskDependencyRevision {
  return {
    id: stringValue(row.id),
    repositoryId: stringValue(row.repository_id),
    planRevisionId: stringValue(row.plan_revision_id),
    version: numberValue(row.version),
    parentRevisionId: row.parent_revision_id === null ? null : stringValue(row.parent_revision_id),
    actorUserId: stringValue(row.actor_user_id),
    at: Number(numericValue(row.at)),
    edges: edgesValue(row.edges),
  };
}

async function readRevision(sql: Sql, repositoryId: string, planRevisionId: string) {
  const row = (
    await sql.query(
      `SELECT revision.*
         FROM execution_task_dependencies dependency
         JOIN execution_task_dependency_revisions revision
           ON revision.repository_id=dependency.repository_id
          AND revision.plan_revision_id=dependency.plan_revision_id
          AND revision.id=dependency.head_revision_id
        WHERE dependency.repository_id=$1 AND dependency.plan_revision_id=$2`,
      [repositoryId, planRevisionId],
      decode,
    )
  ).rows[0];
  return row ?? null;
}

function persistenceError(error: unknown): never {
  if (error instanceof ExecutionError) throw error;
  if (error && typeof error === "object") {
    const code = Reflect.get(error, "code");
    if (code === "23505")
      throw new ExecutionError(
        409,
        "Task dependency write conflicts with current state.",
        "CONFLICT",
      );
    if (code === "23503" || code === "23514")
      throw new ExecutionError(409, "Task dependency constraint failed.", "CONFLICT");
  }
  throw error;
}

export class PostgresTaskDependencies implements TaskDependencyReads, TaskDependencyTransactions {
  constructor(
    private readonly content: (sql: Sql) => ContentPlanReferenceReader,
    private readonly db: Database = businessDatabase(),
  ) {}

  read(userId: string, query: { repositoryId: string; planRevisionId: string }) {
    return this.db.transaction(async (sql) => {
      const { repository } = await repositoryContentScope(sql, userId, {
        repositoryId: query.repositoryId,
      });
      await this.content(sql).verifyRevision(userId, repository.id, query.planRevisionId);
      const revision = await readRevision(sql, repository.id, query.planRevisionId);
      return revision
        ? {
            repositoryId: revision.repositoryId,
            planRevisionId: revision.planRevisionId,
            version: revision.version,
            revisionId: revision.id,
            edges: revision.edges.map((edge) => ({ ...edge })),
          }
        : {
            repositoryId: repository.id,
            planRevisionId: query.planRevisionId,
            version: 0,
            revisionId: null,
            edges: [],
          };
    });
  }

  transact<T>(
    userId: string,
    scope: { repositoryId: string; planRevisionId: string },
    evidence: { requestId: string; payload: string },
    operation: (tx: TaskDependencyTransaction) => Promise<T>,
  ) {
    const fingerprint = createHash("sha256").update(evidence.payload).digest("hex");
    return this.db
      .transaction(async (sql) => {
        const { repository, archived } = await repositoryContentScope(sql, userId, {
          repositoryId: scope.repositoryId,
        });
        await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `execution-task-dependencies:${repository.id}`,
        ]);
        await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `execution-task-dependency-request:${userId}:${evidence.requestId}`,
        ]);
        return operation({
          scope: { repositoryId: repository.id, permissions: repository.permissions, archived },
          content: this.content(sql),
          nextId: randomUUID,
          replay: async () => {
            const receipt = (
              await sql.query(
                `SELECT fingerprint,repository_id,plan_revision_id,revision_id
                 FROM execution_task_dependency_commands
                WHERE actor_user_id=$1 AND request_id=$2`,
                [userId, evidence.requestId],
                (row) => ({
                  fingerprint: stringValue(row.fingerprint),
                  repositoryId: stringValue(row.repository_id),
                  planRevisionId: stringValue(row.plan_revision_id),
                  revisionId: stringValue(row.revision_id),
                }),
              )
            ).rows[0];
            if (!receipt) return null;
            if (
              receipt.fingerprint !== fingerprint ||
              receipt.repositoryId !== repository.id ||
              receipt.planRevisionId !== scope.planRevisionId
            )
              throw new ExecutionError(
                409,
                "Task dependency request identity reused with different content.",
                "CONFLICT",
              );
            const revision = (
              await sql.query(
                `SELECT * FROM execution_task_dependency_revisions
                WHERE repository_id=$1 AND plan_revision_id=$2 AND id=$3`,
                [repository.id, scope.planRevisionId, receipt.revisionId],
                decode,
              )
            ).rows[0];
            if (!revision)
              throw new ExecutionError(503, "Task dependency receipt unavailable.", "UNAVAILABLE");
            return { requestId: evidence.requestId, revision };
          },
          dependencies: {
            load: async () => {
              await sql.query(
                `SELECT repository_id FROM execution_task_dependencies
                WHERE repository_id=$1 AND plan_revision_id=$2 FOR UPDATE`,
                [repository.id, scope.planRevisionId],
              );
              return readRevision(sql, repository.id, scope.planRevisionId);
            },
            save: async (next, expectedVersion) => {
              if (next.parentRevisionId === null)
                await sql.query(
                  `INSERT INTO execution_task_dependencies(
                   repository_id,plan_revision_id,version,head_revision_id
                 ) VALUES($1,$2,$3,$4)`,
                  [repository.id, next.planRevisionId, next.version, next.id],
                );
              await sql.query(
                `INSERT INTO execution_task_dependency_revisions(
                 id,repository_id,plan_revision_id,version,parent_revision_id,actor_user_id,at,edges
               ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
                [
                  next.id,
                  repository.id,
                  next.planRevisionId,
                  next.version,
                  next.parentRevisionId,
                  next.actorUserId,
                  next.at,
                  JSON.stringify(next.edges),
                ],
              );
              if (
                next.parentRevisionId !== null &&
                !(
                  await sql.query(
                    `UPDATE execution_task_dependencies
                      SET version=$3,head_revision_id=$4
                    WHERE repository_id=$1 AND plan_revision_id=$2 AND version=$5
                    RETURNING repository_id`,
                    [repository.id, next.planRevisionId, next.version, next.id, expectedVersion],
                  )
                ).rows.length
              )
                throw new ExecutionError(409, "Task dependency version conflict.", "CONFLICT");
            },
          },
          record: async (revision) => {
            await sql.query(
              `INSERT INTO execution_task_dependency_commands(
               actor_user_id,request_id,repository_id,plan_revision_id,fingerprint,revision_id
             ) VALUES($1,$2,$3,$4,$5,$6)`,
              [
                userId,
                evidence.requestId,
                repository.id,
                revision.planRevisionId,
                fingerprint,
                revision.id,
              ],
            );
          },
        });
      })
      .catch(persistenceError);
  }
}
