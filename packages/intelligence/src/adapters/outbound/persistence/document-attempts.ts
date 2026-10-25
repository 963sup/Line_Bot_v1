import { randomUUID } from "node:crypto";
import type { FileRevisionQualifier } from "@line_bot_v1/file/contracts/output/references";
import {
  businessDatabase,
  type Database,
  type Sql,
  type SqlRow,
} from "@line_bot_v1/platform/postgres";
import { stringValue } from "@line_bot_v1/platform/validation";
import type {
  DocumentAttempt,
  DocumentAttemptInput,
  DocumentAttempts,
} from "../../../contracts/output/document-attempts.js";
import { DocumentAttemptError as AttemptError } from "../../../contracts/output/document-attempts.js";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const sha256 = /^[0-9a-f]{64}$/;

type StoredAttempt = Readonly<{
  id: string;
  actor: string;
  requestId: string;
  repositoryId: string;
  fileId: string;
  fileRevisionId: string;
  fileSha256: string;
  intentFingerprint: string;
  state: "STARTED" | "UNKNOWN" | "COMPLETED";
  targetDocumentId: string | null;
  targetRevisionId: string | null;
}>;

function invalid(): never {
  throw new AttemptError(400, "INVALID_ATTEMPT");
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || !uuid.test(value)) return invalid();
  return value.toLowerCase();
}

function targetReference(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256 || value.includes("\u0000"))
    return invalid();
  return value;
}

function input(value: DocumentAttemptInput): DocumentAttemptInput {
  if (
    typeof value.repositoryId !== "string" ||
    !value.repositoryId.trim() ||
    value.repositoryId.length > 128 ||
    typeof value.intentFingerprint !== "string" ||
    !sha256.test(value.intentFingerprint) ||
    typeof value.source.fileSha256 !== "string" ||
    !sha256.test(value.source.fileSha256)
  )
    return invalid();
  return {
    requestId: identifier(value.requestId),
    repositoryId: value.repositoryId,
    source: {
      fileId: identifier(value.source.fileId),
      fileRevisionId: identifier(value.source.fileRevisionId),
      fileSha256: value.source.fileSha256,
    },
    intentFingerprint: value.intentFingerprint,
  };
}

function decode(row: SqlRow): StoredAttempt {
  const state = stringValue(row.state);
  if (state !== "STARTED" && state !== "UNKNOWN" && state !== "COMPLETED")
    throw new TypeError("Invalid document attempt state.");
  return {
    id: stringValue(row.id),
    actor: stringValue(row.actor_user_id),
    requestId: stringValue(row.request_id),
    repositoryId: stringValue(row.repository_id),
    fileId: stringValue(row.file_id),
    fileRevisionId: stringValue(row.file_revision_id),
    fileSha256: stringValue(row.file_sha256),
    intentFingerprint: stringValue(row.intent_fingerprint),
    state,
    targetDocumentId: row.target_document_id === null ? null : stringValue(row.target_document_id),
    targetRevisionId: row.target_revision_id === null ? null : stringValue(row.target_revision_id),
  };
}

function same(attempt: StoredAttempt, actor: string, value: DocumentAttemptInput): boolean {
  return (
    attempt.actor === actor &&
    attempt.requestId === value.requestId &&
    attempt.repositoryId === value.repositoryId &&
    attempt.fileId === value.source.fileId &&
    attempt.fileRevisionId === value.source.fileRevisionId &&
    attempt.fileSha256 === value.source.fileSha256 &&
    attempt.intentFingerprint === value.intentFingerprint
  );
}

async function lock(sql: Sql, actor: string, requestId: string) {
  await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `intelligence-document-attempt:${actor}:${requestId}`,
  ]);
}

async function load(sql: Sql, actor: string, requestId: string): Promise<StoredAttempt | null> {
  return (
    (
      await sql.query(
        `SELECT id,actor_user_id,request_id,repository_id,file_id,file_revision_id,file_sha256,
              intent_fingerprint,state,target_document_id,target_revision_id
       FROM intelligence_document_intakes WHERE actor_user_id=$1 AND request_id=$2 FOR UPDATE`,
        [actor, requestId],
        decode,
      )
    ).rows[0] ?? null
  );
}

class PostgresDocumentAttempts implements DocumentAttempts {
  constructor(
    private readonly qualifier: (sql: Sql) => FileRevisionQualifier,
    private readonly db: Database = businessDatabase(),
  ) {}

  async reserve(actor: string, raw: DocumentAttemptInput): Promise<DocumentAttempt> {
    const value = input(raw);
    return this.db.transaction(async (sql) => {
      await this.qualifier(sql).verify(actor, value.repositoryId, value.source);
      await lock(sql, actor, value.requestId);
      const prior = await load(sql, actor, value.requestId);
      if (prior) {
        if (!same(prior, actor, value)) throw new AttemptError(409, "REQUEST_ID_REUSED");
        return { id: prior.id, fresh: false };
      }
      const id = randomUUID();
      await sql.query(
        `INSERT INTO intelligence_document_intakes(
          id,actor_user_id,request_id,repository_id,file_id,file_revision_id,file_sha256,intent_fingerprint,state
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'STARTED')`,
        [
          id,
          actor,
          value.requestId,
          value.repositoryId,
          value.source.fileId,
          value.source.fileRevisionId,
          value.source.fileSha256,
          value.intentFingerprint,
        ],
      );
      return { id, fresh: true };
    });
  }

  async complete(
    actor: string,
    raw: DocumentAttemptInput & Readonly<{ id: string }>,
    target: Readonly<{ documentId: string; revisionId: string }>,
  ): Promise<void> {
    const value = input(raw);
    const id = identifier(raw.id);
    const documentId = targetReference(target.documentId);
    const revisionId = targetReference(target.revisionId);
    await this.db.transaction(async (sql) => {
      await this.qualifier(sql).verify(actor, value.repositoryId, value.source);
      await lock(sql, actor, value.requestId);
      const prior = await load(sql, actor, value.requestId);
      if (!prior || !same(prior, actor, value) || prior.id !== id)
        throw new AttemptError(409, "ATTEMPT_FENCED");
      if (prior.state === "COMPLETED") {
        if (prior.targetDocumentId !== documentId || prior.targetRevisionId !== revisionId)
          throw new AttemptError(409, "COMPLETION_CONFLICT");
        return;
      }
      await sql.query(
        `UPDATE intelligence_document_intakes
         SET state='COMPLETED',target_document_id=$3,target_revision_id=$4
         WHERE actor_user_id=$1 AND request_id=$2 AND id=$5 AND state IN ('STARTED','UNKNOWN')`,
        [actor, value.requestId, documentId, revisionId, id],
      );
    });
  }

  async unknown(
    actor: string,
    raw: DocumentAttemptInput & Readonly<{ id: string }>,
  ): Promise<void> {
    const value = input(raw);
    const id = identifier(raw.id);
    await this.db.transaction(async (sql) => {
      await this.qualifier(sql).verify(actor, value.repositoryId, value.source);
      await lock(sql, actor, value.requestId);
      const prior = await load(sql, actor, value.requestId);
      if (!prior || !same(prior, actor, value) || prior.id !== id)
        throw new AttemptError(409, "ATTEMPT_FENCED");
      if (prior.state === "COMPLETED") return;
      await sql.query(
        `UPDATE intelligence_document_intakes SET state='UNKNOWN'
         WHERE actor_user_id=$1 AND request_id=$2 AND id=$3 AND state IN ('STARTED','UNKNOWN')`,
        [actor, value.requestId, id],
      );
    });
  }
}

/** Composition hosts may inject a database; this adapter owns its technical receipt wiring. */
export function createPostgresDocumentAttempts(
  qualifier: (sql: Sql) => FileRevisionQualifier,
  db: Database = businessDatabase(),
): DocumentAttempts {
  return new PostgresDocumentAttempts(qualifier, db);
}
