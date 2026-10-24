import { randomUUID } from "node:crypto";
import { createPostgresFileRevisionQualifier } from "@line_bot_v1/file/composition/bootstrap/files";
import { businessDatabase, type Database, type SqlRow } from "@line_bot_v1/platform/postgres";
import { numberValue, stringValue } from "@line_bot_v1/platform/validation";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type { DocumentReceipt } from "../../../contracts/input/document-intake.js";
import type {
  ContractDocumentIntakeTransaction,
  ContractDocumentIntakeTransactions,
} from "../../../contracts/output/document-intake.js";
import type {
  ContractDocumentRevision,
  DocumentSource,
  PurchaseOrderCandidate,
} from "../../../domain/document-intake.js";
import {
  decodeDocumentSource,
  decodePurchaseOrderCandidate,
} from "../../../domain/document-intake-decoder.js";
import { ContractError } from "../../../domain/error.js";

function json(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new TypeError("Invalid stored JSON.");
  }
}

function documentSource(value: unknown): DocumentSource {
  try {
    return decodeDocumentSource(value);
  } catch {
    throw new TypeError("Invalid stored Contract document source.");
  }
}

function purchaseOrderCandidate(value: unknown): PurchaseOrderCandidate {
  try {
    return decodePurchaseOrderCandidate(value);
  } catch {
    throw new TypeError("Invalid stored Contract document candidate.");
  }
}

function storedDiagnostics(value: unknown): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
  throw new TypeError("Invalid stored diagnostics.");
}

function decodeRevision(row: SqlRow): ContractDocumentRevision {
  const candidate = purchaseOrderCandidate(json(row.candidate));
  const diagnostics = storedDiagnostics(json(row.diagnostics));
  if (numberValue(row.schema_version) !== 1)
    throw new TypeError("Unsupported Contract document schema version.");
  const state = stringValue(row.state);
  if (state !== "DRAFT" && state !== "CONFIRMED")
    throw new TypeError("Invalid stored Contract document state.");
  return {
    schemaVersion: 1,
    id: stringValue(row.id),
    documentId: stringValue(row.document_id),
    repositoryId: stringValue(row.repository_id),
    version: numberValue(row.version),
    parentRevisionId: row.parent_revision_id === null ? null : stringValue(row.parent_revision_id),
    actorUserId: stringValue(row.actor_user_id),
    at: Number(row.at),
    state,
    source: documentSource({
      fileId: stringValue(row.file_id),
      fileRevisionId: stringValue(row.file_revision_id),
      fileSha256: stringValue(row.file_sha256),
    }),
    expectedLineCount: numberValue(row.expected_line_count),
    candidate,
    diagnostics,
    acknowledgementReason:
      row.acknowledgement_reason === null ? null : stringValue(row.acknowledgement_reason),
  };
}

function receipt(row: SqlRow): DocumentReceipt {
  return {
    requestId: stringValue(row.request_id),
    repositoryId: stringValue(row.repository_id),
    documentId: stringValue(row.document_id),
    revisionId: stringValue(row.revision_id),
    version: numberValue(row.version),
    fingerprint: stringValue(row.fingerprint),
    intentFingerprint: stringValue(row.intent_fingerprint),
    source: documentSource(json(row.source)),
  };
}

export class PostgresContractDocuments implements ContractDocumentIntakeTransactions {
  constructor(private readonly db: Database = businessDatabase()) {}

  read(
    actor: string,
    query: Readonly<{ repositoryId: string; documentId: string; revisionId?: string }>,
  ) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, actor, { repositoryId: query.repositoryId });
      const revision = (
        await sql.query(
          `SELECT revision.* FROM contract_documents document
           JOIN contract_document_revisions revision ON revision.repository_id=document.repository_id
            AND revision.document_id=document.id
           WHERE document.repository_id=$1 AND document.id=$2
             AND (($3::uuid IS NULL AND revision.id=document.head_revision_id) OR revision.id=$3)`,
          [query.repositoryId, query.documentId, query.revisionId ?? null],
          decodeRevision,
        )
      ).rows[0];
      if (!revision) return null;
      await createPostgresFileRevisionQualifier(sql).verify(
        actor,
        query.repositoryId,
        revision.source,
      );
      return revision;
    });
  }

  async receipt(
    actor: string,
    scope: Readonly<{ repositoryId: string; documentId: string; requestId: string }>,
  ) {
    return this.db.transaction(async (sql) => {
      await repositoryContentScope(sql, actor, { repositoryId: scope.repositoryId });
      const result = await sql.query(
        `SELECT command.request_id,command.repository_id,command.document_id,command.revision_id,
                revision.version,command.fingerprint,command.intent_fingerprint,
                jsonb_build_object('fileId',revision.file_id,'fileRevisionId',revision.file_revision_id,'fileSha256',revision.file_sha256) source
         FROM contract_document_commands command
         JOIN contract_document_revisions revision ON revision.repository_id=command.repository_id
          AND revision.document_id=command.document_id AND revision.id=command.revision_id
         WHERE command.actor_user_id=$1 AND command.request_id=$2 AND command.repository_id=$3 AND command.document_id=$4`,
        [actor, scope.requestId, scope.repositoryId, scope.documentId],
        receipt,
      );
      const found = result.rows[0] ?? null;
      if (found)
        await createPostgresFileRevisionQualifier(sql).verify(
          actor,
          scope.repositoryId,
          found.source,
        );
      return found;
    });
  }

  transact<T>(
    actor: string,
    input: Readonly<{
      repositoryId: string;
      documentId: string;
      requestId: string;
      intentFingerprint: string;
      fingerprint: string;
    }>,
    operation: (tx: ContractDocumentIntakeTransaction) => Promise<T>,
  ) {
    return this.db.transaction(async (sql) => {
      const { repository, archived } = await repositoryContentScope(sql, actor, {
        repositoryId: input.repositoryId,
      });
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `contract-document-aggregate:${repository.id}:${input.documentId}`,
      ]);
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `contract-document:${actor}:${input.requestId}`,
      ]);
      const replayRow = async () =>
        (
          await sql.query(
            `SELECT command.request_id,command.repository_id,command.document_id,command.revision_id,
                revision.version,command.fingerprint,command.intent_fingerprint,
                jsonb_build_object('fileId',revision.file_id,'fileRevisionId',revision.file_revision_id,'fileSha256',revision.file_sha256) source
         FROM contract_document_commands command JOIN contract_document_revisions revision
          ON revision.repository_id=command.repository_id AND revision.document_id=command.document_id AND revision.id=command.revision_id
         WHERE command.actor_user_id=$1 AND command.request_id=$2`,
            [actor, input.requestId],
            receipt,
          )
        ).rows[0];
      const transaction: ContractDocumentIntakeTransaction = {
        repositoryId: repository.id,
        permissions: repository.permissions,
        archived,
        nextId: randomUUID,
        verifySource: async (userId, source) =>
          createPostgresFileRevisionQualifier(sql).verify(userId, repository.id, source),
        replay: async () => {
          const row = await replayRow();
          if (!row) return null;
          if (
            row.repositoryId !== repository.id ||
            row.documentId !== input.documentId ||
            row.intentFingerprint !== input.intentFingerprint ||
            row.fingerprint !== input.fingerprint
          )
            throw new ContractError(
              409,
              "Request identity reused with different content.",
              "REQUEST_ID_REUSED",
            );
          await transaction.verifySource(actor, row.source);
          return row;
        },
        load: async () => {
          await sql.query(
            "SELECT id FROM contract_documents WHERE repository_id=$1 AND id=$2 FOR UPDATE",
            [repository.id, input.documentId],
          );
          const row = (
            await sql.query(
              `SELECT * FROM contract_document_revisions WHERE repository_id=$1 AND document_id=$2
             ORDER BY version DESC LIMIT 1`,
              [repository.id, input.documentId],
              decodeRevision,
            )
          ).rows[0];
          return row ?? null;
        },
        save: async (revision, expectedVersion) => {
          if (revision.parentRevisionId === null)
            await sql.query(
              "INSERT INTO contract_documents(id,repository_id,version,head_revision_id) VALUES($1,$2,$3,$4)",
              [revision.documentId, repository.id, revision.version, revision.id],
            );
          await sql.query(
            `INSERT INTO contract_document_revisions(id,document_id,repository_id,version,parent_revision_id,actor_user_id,at,state,schema_version,
             file_id,file_revision_id,file_sha256,expected_line_count,candidate,diagnostics,acknowledgement_reason)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16)`,
            [
              revision.id,
              revision.documentId,
              repository.id,
              revision.version,
              revision.parentRevisionId,
              actor,
              revision.at,
              revision.state,
              revision.schemaVersion,
              revision.source.fileId,
              revision.source.fileRevisionId,
              revision.source.fileSha256,
              revision.expectedLineCount,
              JSON.stringify(revision.candidate),
              JSON.stringify(revision.diagnostics),
              revision.acknowledgementReason,
            ],
          );
          if (
            revision.parentRevisionId !== null &&
            !(
              await sql.query(
                "UPDATE contract_documents SET version=$3,head_revision_id=$4 WHERE repository_id=$1 AND id=$2 AND version=$5 RETURNING id",
                [
                  repository.id,
                  revision.documentId,
                  revision.version,
                  revision.id,
                  expectedVersion,
                ],
              )
            ).rows.length
          )
            throw new ContractError(409, "Document version conflict.", "VERSION_CONFLICT");
        },
        record: async (revision) => {
          const inserted = (
            await sql.query(
              `INSERT INTO contract_document_commands(actor_user_id,request_id,repository_id,document_id,revision_id,fingerprint,intent_fingerprint)
             VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING request_id,repository_id,document_id,revision_id,$8::integer version,
             fingerprint,intent_fingerprint,jsonb_build_object('fileId',$9::text,'fileRevisionId',$10::text,'fileSha256',$11::text) source`,
              [
                actor,
                input.requestId,
                repository.id,
                revision.documentId,
                revision.id,
                input.fingerprint,
                input.intentFingerprint,
                revision.version,
                revision.source.fileId,
                revision.source.fileRevisionId,
                revision.source.fileSha256,
              ],
              receipt,
            )
          ).rows[0];
          if (!inserted)
            throw new ContractError(503, "Contract document receipt unavailable.", "UNAVAILABLE");
          return inserted;
        },
      };
      return operation(transaction);
    });
  }
}
