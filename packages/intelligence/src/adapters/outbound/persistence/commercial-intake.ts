import { randomUUID } from "node:crypto";
import type { FileRevisionQualifier } from "@line_bot_v1/file/contracts/output/references";
import type { Database, Sql, SqlRow } from "@line_bot_v1/platform/postgres";
import { literalValue, numberValue, record, stringValue } from "@line_bot_v1/platform/validation";
import {
  stableCommercialId,
  validateCommercialObservations,
} from "../../../application/commercial-observations.js";
import { commercialFingerprint as hash } from "../../../application/commercial-profile.js";
import {
  type CommercialExtractionResult,
  type CommercialIntakeCommand,
  CommercialIntakeError,
} from "../../../contracts/output/commercial-intake.js";
import type {
  CommercialIntakeStore,
  CommercialJob,
  ExtractionProfile,
} from "../../../contracts/ports/commercial-intake.js";

function decodeCommand(value: unknown): CommercialIntakeCommand {
  const c = record(value),
    source = record(c.source),
    target = record(c.target);
  return {
    commandId: stringValue(c.commandId),
    repositoryId: stringValue(c.repositoryId),
    source: {
      fileId: stringValue(source.fileId),
      fileRevisionId: stringValue(source.fileRevisionId),
      sha256: stringValue(source.sha256),
    },
    target: {
      documentId: stringValue(target.documentId),
      draftCommandId: stringValue(target.draftCommandId),
      expectedDocumentVersion: numberValue(target.expectedDocumentVersion),
    },
  };
}
function decodeProfile(value: unknown): ExtractionProfile {
  const p = record(value);
  return {
    key: stringValue(p.key),
    model: stringValue(p.model),
    modelFingerprint: stringValue(p.modelFingerprint),
    normalizerFingerprint: stringValue(p.normalizerFingerprint),
    schemaFingerprint: stringValue(p.schemaFingerprint),
    promptFingerprint: stringValue(p.promptFingerprint),
    configurationFingerprint: stringValue(p.configurationFingerprint),
    normalizerVersion: stringValue(p.normalizerVersion),
    maxInputBytes: numberValue(p.maxInputBytes),
    maxPdfPages: numberValue(p.maxPdfPages),
    maxOutputTokens: numberValue(p.maxOutputTokens),
    timeoutMs: numberValue(p.timeoutMs),
    inputTokenCountTimeoutMs: numberValue(p.inputTokenCountTimeoutMs),
    inputTokenBudget: numberValue(p.inputTokenBudget),
    estimatorVersion: stringValue(p.estimatorVersion),
  };
}
function decode(row: SqlRow): CommercialJob {
  return {
    id: String(row.id),
    actor: String(row.actor_user_id),
    command: decodeCommand(row.command),
    intent: String(row.intent_fingerprint),
    profile: decodeProfile(row.profile),
    pageCount: Number(row.page_count),
    byteLength: Number(row.byte_length),
    inputTokenCount: Number(row.input_token_count),
    token: String(row.dispatch_token),
    version: Number(row.version),
    leaseUntil: Number(row.lease_until),
    state: literalValue(row.state, [
      "RESERVED",
      "DISPATCHED",
      "READY",
      "FAILED",
      "OUTCOME_UNKNOWN",
    ]),
    dispatchCount: Number(row.dispatch_count),
    extractionResultId: row.extraction_result_id === null ? null : String(row.extraction_result_id),
    failure:
      row.failure_code === null
        ? null
        : { code: String(row.failure_code), stage: String(row.failure_stage) },
  };
}
const fenced = () => new CommercialIntakeError("EXTRACTION_FENCED", 409, "extraction.persist");
export function createPostgresCommercialIntakeStore(
  db: Database,
  qualifier: (sql: Sql) => FileRevisionQualifier,
): CommercialIntakeStore {
  async function qualify(sql: Sql, actor: string, command: CommercialIntakeCommand) {
    await qualifier(sql).verify(actor, command.repositoryId, {
      fileId: command.source.fileId,
      fileRevisionId: command.source.fileRevisionId,
      fileSha256: command.source.sha256,
    });
  }
  async function lock(sql: Sql, actor: string, commandId: string) {
    await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `commercial-extraction:${actor}:${commandId}`,
    ]);
  }
  async function load(sql: Sql, actor: string, commandId: string) {
    return (
      (
        await sql.query(
          "SELECT * FROM document_extraction_jobs WHERE actor_user_id=$1 AND command_id=$2",
          [actor, commandId],
          decode,
        )
      ).rows[0] ?? null
    );
  }
  return {
    qualify: (actor, command) => db.transaction((sql) => qualify(sql, actor, command)),
    find: (actor, repositoryId, commandId) =>
      db.transaction(async (sql) => {
        const job = await load(sql, actor, commandId);
        if (!job) return null;
        if (job.command.repositoryId !== repositoryId)
          throw new CommercialIntakeError("INTAKE_NOT_FOUND", 404, "intake.read");
        await qualify(sql, actor, job.command);
        return job;
      }),
    reserve: (actor, command, intent, profile, manifest) =>
      db.transaction(async (sql) => {
        await qualify(sql, actor, command);
        await lock(sql, actor, command.commandId);
        const prior = await load(sql, actor, command.commandId);
        if (prior) {
          if (prior.intent !== intent)
            throw new CommercialIntakeError("COMMAND_ID_REUSED", 409, "intake.reserve");
          if (prior.state !== "RESERVED" || prior.leaseUntil > Date.now())
            return { job: prior, owned: false };
          const token = randomUUID();
          const lease = Date.now() + 30_000;
          const changed = await sql.query(
            `UPDATE document_extraction_jobs SET dispatch_token=$3,version=version+1,lease_until=$4 WHERE id=$1 AND version=$2 AND state='RESERVED' AND dispatch_count=0 RETURNING *`,
            [prior.id, prior.version, token, lease],
            decode,
          );
          const job = changed.rows[0];
          return job ? { job, owned: true } : { job: prior, owned: false };
        }
        const job: CommercialJob = {
          id: randomUUID(),
          actor,
          command,
          intent,
          profile,
          ...manifest,
          token: randomUUID(),
          version: 1,
          leaseUntil: Date.now() + 30_000,
          state: "RESERVED",
          dispatchCount: 0,
          extractionResultId: null,
          failure: null,
        };
        await sql.query(
          `INSERT INTO document_extraction_jobs(id,actor_user_id,command_id,repository_id,file_id,file_revision_id,file_sha256,command,intent_fingerprint,profile,page_count,byte_length,dispatch_token,version,lease_until,state,input_token_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11,$12,$13,1,$14,'RESERVED',$15)`,
          [
            job.id,
            actor,
            command.commandId,
            command.repositoryId,
            command.source.fileId,
            command.source.fileRevisionId,
            command.source.sha256,
            JSON.stringify(command),
            intent,
            JSON.stringify(profile),
            manifest.pageCount,
            manifest.byteLength,
            job.token,
            job.leaseUntil,
            manifest.inputTokenCount,
          ],
        );
        return { job, owned: true };
      }),
    dispatch: (job) =>
      db.transaction(async (sql) => {
        await qualify(sql, job.actor, job.command);
        const result = await sql.query(
          `UPDATE document_extraction_jobs SET state='DISPATCHED',dispatch_count=1,version=version+1 WHERE id=$1 AND dispatch_token=$2 AND version=$3 AND state='RESERVED' AND dispatch_count=0 RETURNING id`,
          [job.id, job.token, job.version],
        );
        return result.rows.length === 1;
      }),
    complete: (job, result) =>
      db.transaction(async (sql) => {
        await lock(sql, job.actor, job.command.commandId);
        const current = await load(sql, job.actor, job.command.commandId);
        const fingerprint = hash(result);
        if (current?.state === "READY") {
          const prior = await sql.query(
            "SELECT result_fingerprint FROM document_extraction_results WHERE id=$1",
            [current.extractionResultId],
          );
          if (current.token !== job.token || prior.rows[0]?.result_fingerprint !== fingerprint)
            throw fenced();
          return;
        }
        if (
          !current ||
          current.token !== job.token ||
          !["DISPATCHED", "OUTCOME_UNKNOWN"].includes(current.state) ||
          current.dispatchCount !== 1
        )
          throw fenced();
        await sql.query(
          "INSERT INTO document_extraction_results(id,job_id,repository_id,result,result_fingerprint) VALUES($1,$2,$3,$4::jsonb,$5)",
          [
            result.extractionResultId,
            job.id,
            job.command.repositoryId,
            JSON.stringify(result),
            fingerprint,
          ],
        );
        await sql.query(
          `UPDATE document_extraction_jobs SET state='READY',extraction_result_id=$2,version=version+1,failure_code=null,failure_stage=null WHERE id=$1 AND dispatch_token=$3`,
          [job.id, result.extractionResultId, job.token],
        );
      }),
    fail: (job, code, stage, unknown) =>
      db.transaction(async (sql) => {
        await sql.query(
          `UPDATE document_extraction_jobs SET state=$3,failure_code=$4,failure_stage=$5,version=version+1 WHERE id=$1 AND dispatch_token=$2 AND state IN ('DISPATCHED','OUTCOME_UNKNOWN') AND extraction_result_id IS NULL`,
          [job.id, job.token, unknown ? "OUTCOME_UNKNOWN" : "FAILED", code, stage],
        );
      }),
    result: (actor, repositoryId, resultId) =>
      db.transaction(async (sql) => {
        const rows = await sql.query(
          `SELECT j.*,r.result,r.result_fingerprint FROM document_extraction_results r JOIN document_extraction_jobs j ON j.id=r.job_id WHERE r.id=$1 AND r.repository_id=$2`,
          [resultId, repositoryId],
        );
        const row = rows.rows[0];
        if (!row)
          throw new CommercialIntakeError("EXTRACTION_RESULT_NOT_FOUND", 404, "extraction.read");
        const job = decode(row);
        await qualify(sql, actor, job.command);
        const stored = record(row.result);
        const rawObservations = stored.observations;
        if (!Array.isArray(rawObservations)) throw new TypeError("Invalid stored observations.");
        const payload = validateCommercialObservations(
          {
            observations: rawObservations.map((value) => {
              const o = record(value);
              return { pageNumber: o.pageNumber, rawLabel: o.rawLabel, rawValue: o.rawValue };
            }),
            semanticHints: stored.semanticHints,
          },
          job.pageCount,
        );
        const result: CommercialExtractionResult = {
          extractionResultId: stringValue(stored.extractionResultId),
          repositoryId: stringValue(stored.repositoryId),
          source: decodeCommand({ ...job.command, source: stored.source }).source,
          pageCount: numberValue(stored.pageCount),
          observations: payload.observations.map((o, index) => ({
            ...o,
            observationId: stableCommercialId(resultId, `observation:${index}`),
          })),
          semanticHints: payload.semanticHints,
        };
        if (
          job.state !== "READY" ||
          job.extractionResultId !== resultId ||
          result.extractionResultId !== resultId ||
          result.repositoryId !== repositoryId ||
          result.pageCount !== job.pageCount ||
          hash(result.source) !== hash(job.command.source) ||
          hash(result) !== row.result_fingerprint ||
          hash(stored) !== row.result_fingerprint
        )
          throw new CommercialIntakeError("EXTRACTION_RESULT_INVALID", 503, "extraction.read");
        return result;
      }),
  };
}
