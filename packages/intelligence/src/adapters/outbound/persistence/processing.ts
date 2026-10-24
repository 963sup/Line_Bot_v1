import { createHash, randomUUID } from "node:crypto";
import { createPostgresFileRevisionQualifier } from "@line_bot_v1/file/composition/bootstrap/files";
import { FileError } from "@line_bot_v1/file/domain/error";
import { businessDatabase, type Database, type SqlRow } from "@line_bot_v1/platform/postgres";
import {
  booleanValue,
  literalValue,
  numberValue,
  record,
  stringValue,
} from "@line_bot_v1/platform/validation";
import { RepositoryError } from "@line_bot_v1/repository/contracts/errors/repository-error";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type {
  IntelligenceProcessingStore,
  ProcessingCommand,
  ProcessingTransaction,
} from "../../../contracts/output/processing.js";
import type {
  Observation,
  ProcessingOutput,
  ProcessingRevision,
} from "../../../domain/processing.js";

function parsedJson(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function readOutput(value: unknown): ProcessingOutput | null {
  if (value == null) return null;
  const output = record(parsedJson(value));
  if (!Array.isArray(output.observations)) throw new TypeError("Invalid processing output");
  return {
    documentKind: stringValue(output.documentKind),
    observations: output.observations.map((item): Observation => {
      const observation = record(item);
      return {
        id: stringValue(observation.id),
        label: stringValue(observation.label),
        value: observation.value === null ? null : stringValue(observation.value),
        uncertain: booleanValue(observation.uncertain),
      };
    }),
  };
}

function readEdits(value: unknown): readonly unknown[] {
  const edits = parsedJson(value);
  if (!Array.isArray(edits)) throw new TypeError("Invalid processing edits");
  return Array.from(edits);
}

function decode(row: SqlRow): ProcessingRevision {
  return {
    id: stringValue(row.id),
    repositoryId: stringValue(row.repository_id),
    runId: stringValue(row.run_id),
    fileId: stringValue(row.file_id),
    fileRevisionId: stringValue(row.file_revision_id),
    fileSha256: stringValue(row.file_sha256),
    version: numberValue(row.version),
    parentRevisionId: row.parent_revision_id == null ? null : stringValue(row.parent_revision_id),
    actorUserId: stringValue(row.actor_user_id),
    at: numberValue(row.at),
    state: literalValue(row.state, ["RUNNING", "FAILED", "READY", "SAVED", "DISCARDED"]),
    attemptId: stringValue(row.attempt_id),
    processorId: stringValue(row.processor_id),
    processorVersion: stringValue(row.processor_version),
    processorKind: literalValue(row.processor_kind, ["parser", "ocr", "ai"]),
    rawResult: readOutput(row.raw_result),
    savedResult: readOutput(row.saved_result),
    edits: readEdits(row.edits),
    failure: row.failure == null ? null : literalValue(row.failure, ["PROCESSING_UNAVAILABLE"]),
  };
}
function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function mapError(error: unknown): never {
  if (
    error &&
    typeof error === "object" &&
    ["23505", "23503", "23514"].includes(String(Reflect.get(error, "code")))
  )
    throw new Error("VERSION_CONFLICT");
  throw error;
}

export class PostgresIntelligenceProcessing implements IntelligenceProcessingStore {
  constructor(private readonly db: Database = businessDatabase()) {}
  nextId() {
    return randomUUID();
  }
  read(actor: string, repositoryId: string, runId: string, revisionId?: string) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, actor, { repositoryId });
      const rows = await sql.query(
        `SELECT revision.* FROM intelligence_processing_runs run JOIN intelligence_processing_revisions revision
          ON revision.repository_id=run.repository_id AND revision.run_id=run.id
         WHERE run.repository_id=$1 AND run.id=$2 AND (($3::uuid IS NULL AND revision.id=run.head_revision_id) OR revision.id=$3)`,
        [repositoryId, runId, revisionId ?? null],
        decode,
      );
      return rows.rows[0] ?? null;
    });
  }
  list(actor: string, repositoryId: string, fileId: string, after?: string) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, actor, { repositoryId });
      const result = await sql.query(
        `SELECT revision.* FROM intelligence_processing_runs run JOIN intelligence_processing_revisions revision
        ON revision.repository_id=run.repository_id AND revision.run_id=run.id AND revision.id=run.head_revision_id
        WHERE run.repository_id=$1 AND run.file_id=$2 AND ($3::uuid IS NULL OR run.id>$3) ORDER BY run.id LIMIT 21`,
        [repositoryId, fileId, after ?? null],
        decode,
      );
      return {
        runs: result.rows.slice(0, 20),
        next: result.rows.length > 20 ? (result.rows[19]?.runId ?? null) : null,
      };
    });
  }
  transact(
    actor: string,
    command: ProcessingCommand,
    work: (tx: ProcessingTransaction) => Promise<ProcessingRevision>,
  ): Promise<ProcessingRevision> {
    return this.db.transaction(async (sql) => {
      let scope: Awaited<ReturnType<typeof repositoryContentScope>>;
      try {
        scope = await repositoryContentScope(sql, actor, { repositoryId: command.repositoryId });
      } catch (error) {
        const status =
          error && typeof error === "object" ? Reflect.get(error, "status") : undefined;
        if (status === 403 || status === 404)
          throw new FileError(
            status,
            "Processing access is unavailable.",
            status === 403 ? "FORBIDDEN" : "NOT_FOUND",
          );
        throw error;
      }
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `intelligence-processing-aggregate:${scope.repository.id}:${command.runId}`,
      ]);
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `intelligence-processing:${actor}:${command.requestId}`,
      ]);
      const payloadFingerprint = fingerprint(command);
      const selectReplay = async () =>
        (
          await sql.query<ProcessingRevision & { receipt_fingerprint: string }>(
            `SELECT revision.*,receipt.fingerprint AS receipt_fingerprint FROM intelligence_processing_commands receipt JOIN intelligence_processing_revisions revision
          ON revision.repository_id=receipt.repository_id AND revision.run_id=receipt.run_id AND revision.id=receipt.processing_revision_id
         WHERE receipt.actor_user_id=$1 AND receipt.request_id=$2`,
            [actor, command.requestId],
            (row) => ({
              ...decode(row),
              receipt_fingerprint: stringValue(row.receipt_fingerprint),
            }),
          )
        ).rows[0] ?? null;
      const tx: ProcessingTransaction = {
        repositoryId: scope.repository.id,
        permissions: scope.repository.permissions,
        archived: scope.archived,
        nextId: randomUUID,
        replay: async () => {
          const prior = await selectReplay();
          if (!prior) return null;
          const revision = decode(prior);
          if (revision.repositoryId !== command.repositoryId || revision.runId !== command.runId)
            throw new RepositoryError(409, "Request identity reused.");
          return { revision, exact: prior.receipt_fingerprint === payloadFingerprint };
        },
        load: async () =>
          (
            await sql.query(
              `SELECT revision.* FROM intelligence_processing_runs run JOIN intelligence_processing_revisions revision ON revision.repository_id=run.repository_id AND revision.run_id=run.id AND revision.id=run.head_revision_id WHERE run.repository_id=$1 AND run.id=$2 FOR UPDATE OF run`,
              [scope.repository.id, command.runId],
              decode,
            )
          ).rows[0] ?? null,
        qualifySource: async (source) =>
          createPostgresFileRevisionQualifier(sql).verify(actor, scope.repository.id, source),
        save: async (revision, expectedVersion) => {
          if (
            scope.archived ||
            !scope.repository.permissions.some((permission) =>
              ["write", "maintain", "admin"].includes(permission),
            )
          )
            throw new RepositoryError(
              scope.archived ? 409 : 403,
              "Repository processing write is not allowed.",
            );
          if (revision.version === 1) {
            await sql.query(
              `INSERT INTO intelligence_processing_runs(id,repository_id,file_id,file_revision_id,version,head_revision_id) VALUES($1,$2,$3,$4,1,$5)`,
              [
                revision.runId,
                scope.repository.id,
                revision.fileId,
                revision.fileRevisionId,
                revision.id,
              ],
            );
          }
          await sql.query(
            `INSERT INTO intelligence_processing_revisions(id,run_id,repository_id,file_id,file_revision_id,file_sha256,version,parent_revision_id,actor_user_id,at,state,attempt_id,processor_id,processor_version,processor_kind,raw_result,saved_result,edits,failure)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18::jsonb,$19)`,
            [
              revision.id,
              revision.runId,
              scope.repository.id,
              revision.fileId,
              revision.fileRevisionId,
              revision.fileSha256,
              revision.version,
              revision.parentRevisionId,
              actor,
              revision.at,
              revision.state,
              revision.attemptId,
              revision.processorId,
              revision.processorVersion,
              revision.processorKind,
              JSON.stringify(revision.rawResult),
              JSON.stringify(revision.savedResult),
              JSON.stringify(revision.edits),
              revision.failure,
            ],
          );
          if (revision.version > 1) {
            const update = await sql.query(
              `UPDATE intelligence_processing_runs SET version=$3,head_revision_id=$4 WHERE repository_id=$1 AND id=$2 AND version=$5 RETURNING id`,
              [scope.repository.id, revision.runId, revision.version, revision.id, expectedVersion],
            );
            if (!update.rowCount) throw new Error("VERSION_CONFLICT");
          }
        },
        record: async (revision) => {
          await sql.query(
            `INSERT INTO intelligence_processing_commands(actor_user_id,request_id,repository_id,run_id,fingerprint,processing_revision_id) VALUES($1,$2,$3,$4,$5,$6)`,
            [
              actor,
              command.requestId,
              scope.repository.id,
              command.runId,
              payloadFingerprint,
              revision.id,
            ],
          );
        },
      };
      const prior = await tx.replay();
      if (prior) {
        if (!prior.exact) throw new RepositoryError(409, "Request identity reused.");
        return prior.revision;
      }
      try {
        return await work(tx);
      } catch (error) {
        return mapError(error);
      }
    });
  }
}
