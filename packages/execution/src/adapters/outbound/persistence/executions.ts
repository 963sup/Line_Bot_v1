import { createHash, randomUUID } from "node:crypto";
import type {
  ContractLineBasis,
  ContractReferenceReader,
} from "@line_bot_v1/contract/contracts/output/references";
import {
  businessDatabase,
  type Database,
  type Sql,
  type SqlRow,
} from "@line_bot_v1/platform/postgres";
import {
  literalValue,
  numberValue,
  numericValue,
  record,
  stringValue,
} from "@line_bot_v1/platform/validation";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type { QuantityUnit } from "@line_bot_v1/resources/domain/quantity";
import type {
  ExecutionReads,
  ExecutionTransaction,
  ExecutionTransactions,
} from "../../../contracts/output/executions.js";
import { ExecutionError } from "../../../domain/error.js";
import type { ExecutionRevision } from "../../../domain/execution.js";

function basisValue(value: unknown): ContractLineBasis {
  const basis = record(value);
  const resource = record(basis.resource);
  const measure = record(resource.measure);
  return {
    contractId: stringValue(basis.contractId),
    contractRevisionId: stringValue(basis.contractRevisionId),
    lineId: stringValue(basis.lineId),
    agreedQuantity: stringValue(basis.agreedQuantity),
    resource: {
      resourceId: stringValue(resource.resourceId),
      resourceRevisionId: stringValue(resource.resourceRevisionId),
      resourceVersion: numberValue(resource.resourceVersion),
      name: stringValue(resource.name),
      measure: {
        id: stringValue(measure.id),
        name: stringValue(measure.name),
        subject: stringValue(measure.subject),
        unit: literalValue(measure.unit, ["m", "pcs"] satisfies readonly QuantityUnit[]),
      },
      sourceQuantity: stringValue(resource.sourceQuantity),
    },
  };
}

function decode(row: SqlRow): ExecutionRevision {
  return {
    id: stringValue(row.id),
    executionId: stringValue(row.execution_id),
    repositoryId: stringValue(row.repository_id),
    version: numberValue(row.version),
    parentRevisionId: row.parent_revision_id === null ? null : stringValue(row.parent_revision_id),
    actorUserId: stringValue(row.actor_user_id),
    at: Number(numericValue(row.at)),
    action: literalValue(row.action, ["submit", "accept", "reject", "void"]),
    state: literalValue(row.state, ["SUBMITTED", "ACCEPTED", "REJECTED", "VOIDED"]),
    basis: basisValue(row.basis),
    quantity: stringValue(row.quantity),
    note: stringValue(row.note),
    reason: row.reason === null ? null : stringValue(row.reason),
  };
}

async function readRevision(
  sql: Sql,
  repositoryId: string,
  executionId: string,
  revisionId?: string,
) {
  const row = (
    await sql.query(
      revisionId === undefined
        ? "SELECT r.* FROM engineering_executions e JOIN engineering_execution_revisions r ON r.execution_id=e.id AND r.id=e.head_revision_id WHERE e.repository_id=$1 AND e.id=$2"
        : "SELECT * FROM engineering_execution_revisions WHERE repository_id=$1 AND execution_id=$2 AND id=$3",
      revisionId === undefined
        ? [repositoryId, executionId]
        : [repositoryId, executionId, revisionId],
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
      throw new ExecutionError(409, "Execution write conflicts with current state.", "CONFLICT");
    if (code === "23503" || code === "23514")
      throw new ExecutionError(409, "Execution source or revision constraint failed.", "CONFLICT");
  }
  throw error;
}

export class PostgresExecutions implements ExecutionReads, ExecutionTransactions {
  constructor(
    private readonly references: (sql: Sql) => ContractReferenceReader,
    private readonly db: Database = businessDatabase(),
  ) {}

  read(userId: string, query: { repositoryId: string; executionId: string; revisionId?: string }) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      const found = await readRevision(
        sql,
        query.repositoryId,
        query.executionId,
        query.revisionId,
      );
      if (!found) throw new ExecutionError(404, "Execution revision not found.", "NOT_FOUND");
      return found;
    });
  }

  list(userId: string, query: { repositoryId: string; contractId: string }, after?: string) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      const rows = (
        await sql.query(
          `SELECT e.id,e.version,r.contract_id,r.contract_revision_id,r.line_id,r.state,r.quantity,r.at
             FROM engineering_executions e
             JOIN engineering_execution_revisions r ON r.execution_id=e.id AND r.id=e.head_revision_id
            WHERE e.repository_id=$1 AND e.contract_id=$2 AND ($3::uuid IS NULL OR e.id>$3)
            ORDER BY e.id LIMIT 21`,
          [query.repositoryId, query.contractId, after ?? null],
          (row) => ({
            executionId: stringValue(row.id),
            contractId: stringValue(row.contract_id),
            contractRevisionId: stringValue(row.contract_revision_id),
            lineId: stringValue(row.line_id),
            version: numberValue(row.version),
            state: literalValue(row.state, ["SUBMITTED", "ACCEPTED", "REJECTED", "VOIDED"]),
            quantity: stringValue(row.quantity),
            updatedAt: Number(numericValue(row.at)),
          }),
        )
      ).rows;
      const executions = rows.slice(0, 20);
      return {
        executions,
        next: rows.length > 20 ? (executions.at(-1)?.executionId ?? null) : null,
      };
    });
  }

  history(userId: string, query: { repositoryId: string; executionId: string }, before?: number) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, userId, { repositoryId: query.repositoryId });
      if (!(await readRevision(sql, query.repositoryId, query.executionId)))
        throw new ExecutionError(404, "Execution report not found.", "NOT_FOUND");
      const rows = (
        await sql.query(
          `SELECT * FROM engineering_execution_revisions
            WHERE repository_id=$1 AND execution_id=$2
              AND ($3::integer IS NULL OR version<$3)
            ORDER BY version DESC LIMIT 21`,
          [query.repositoryId, query.executionId, before ?? null],
          decode,
        )
      ).rows;
      const revisions = rows.slice(0, 20);
      return { revisions, next: rows.length > 20 ? (revisions.at(-1)?.version ?? null) : null };
    });
  }

  transact<T>(
    userId: string,
    scope: { repositoryId: string; executionId: string },
    evidence: { requestId: string; payload: string },
    operation: (tx: ExecutionTransaction) => Promise<T>,
  ) {
    const fingerprint = createHash("sha256").update(evidence.payload).digest("hex");
    return this.db
      .transaction(async (sql) => {
        const { repository, archived } = await repositoryContentScope(sql, userId, {
          repositoryId: scope.repositoryId,
        });
        await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `execution:${userId}:${evidence.requestId}`,
        ]);
        return operation({
          scope: { repositoryId: repository.id, permissions: repository.permissions, archived },
          references: this.references(sql),
          nextId: randomUUID,
          replay: async () => {
            const row = (
              await sql.query(
                "SELECT fingerprint,execution_id,revision_id FROM engineering_execution_commands WHERE actor_user_id=$1 AND request_id=$2",
                [userId, evidence.requestId],
                (receipt) => ({
                  fingerprint: stringValue(receipt.fingerprint),
                  executionId: stringValue(receipt.execution_id),
                  revisionId: stringValue(receipt.revision_id),
                }),
              )
            ).rows[0];
            if (!row) return null;
            if (row.fingerprint !== fingerprint || row.executionId !== scope.executionId)
              throw new ExecutionError(
                409,
                "Execution request identity reused with different content.",
                "CONFLICT",
              );
            const revision = await readRevision(
              sql,
              repository.id,
              row.executionId,
              row.revisionId,
            );
            if (!revision)
              throw new ExecutionError(503, "Execution receipt unavailable.", "UNAVAILABLE");
            return { requestId: evidence.requestId, revision };
          },
          executions: {
            load: async () => {
              await sql.query(
                "SELECT id FROM engineering_executions WHERE repository_id=$1 AND id=$2 FOR UPDATE",
                [repository.id, scope.executionId],
              );
              return readRevision(sql, repository.id, scope.executionId);
            },
            save: async (next, expectedVersion) => {
              if (next.parentRevisionId === null)
                await sql.query(
                  "INSERT INTO engineering_executions(id,repository_id,contract_id,version,head_revision_id) VALUES($1,$2,$3,$4,$5)",
                  [next.executionId, repository.id, next.basis.contractId, next.version, next.id],
                );
              await sql.query(
                `INSERT INTO engineering_execution_revisions(
                 id,execution_id,repository_id,version,parent_revision_id,actor_user_id,at,action,state,
                 contract_id,contract_revision_id,contract_revision_state,line_id,basis,quantity,note,reason
               ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'ACTIVE',$12,$13::jsonb,$14,$15,$16)`,
                [
                  next.id,
                  next.executionId,
                  repository.id,
                  next.version,
                  next.parentRevisionId,
                  next.actorUserId,
                  next.at,
                  next.action,
                  next.state,
                  next.basis.contractId,
                  next.basis.contractRevisionId,
                  next.basis.lineId,
                  JSON.stringify(next.basis),
                  next.quantity,
                  next.note,
                  next.reason,
                ],
              );
              if (
                next.parentRevisionId !== null &&
                !(
                  await sql.query(
                    "UPDATE engineering_executions SET version=$3,head_revision_id=$4 WHERE id=$1 AND repository_id=$2 AND version=$5 RETURNING id",
                    [next.executionId, repository.id, next.version, next.id, expectedVersion],
                  )
                ).rows.length
              )
                throw new ExecutionError(409, "Execution version conflict.", "CONFLICT");
            },
          },
          record: async (next) => {
            await sql.query(
              "INSERT INTO engineering_execution_commands(actor_user_id,request_id,repository_id,execution_id,fingerprint,revision_id) VALUES($1,$2,$3,$4,$5,$6)",
              [userId, evidence.requestId, repository.id, next.executionId, fingerprint, next.id],
            );
          },
        });
      })
      .catch(persistenceError);
  }
}
