import { createHash, randomUUID } from "node:crypto";
import {
  businessDatabase,
  type Database,
  type Sql,
  type SqlRow,
} from "@line_bot_v1/platform/postgres";
import { numberValue, numericValue, stringValue } from "@line_bot_v1/platform/validation";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type {
  FileReads,
  FileReceipt,
  FileReclamation,
  FileTransaction,
  FileTransactions,
} from "../../../contracts/output/files.js";
import type { FileRevisionQualifier } from "../../../contracts/output/references.js";
import { FileError } from "../../../domain/error.js";
import type { FileRevision, FileUploadIntent } from "../../../domain/file.js";
import { assertReadable, identifier, scopeId } from "../../../domain/values.js";

const fileColumns = `revision.id,revision.file_id,revision.repository_id,revision.version,
 revision.parent_revision_id,revision.actor_user_id,revision.at,revision.name,
 revision.media_type,revision.byte_length,revision.sha256`;
function fileRevision(row: SqlRow): FileRevision {
  return {
    id: stringValue(row.id),
    fileId: stringValue(row.file_id),
    repositoryId: stringValue(row.repository_id),
    version: numberValue(row.version),
    parentRevisionId: row.parent_revision_id === null ? null : stringValue(row.parent_revision_id),
    actorUserId: stringValue(row.actor_user_id),
    at: Number(numericValue(row.at)),
    name: stringValue(row.name),
    mediaType: stringValue(row.media_type),
    byteLength: numberValue(row.byte_length),
    sha256: stringValue(row.sha256),
  };
}

function uploadIntent(row: SqlRow): FileUploadIntent {
  const expectedVersion = numberValue(row.expected_version);
  return {
    requestId: stringValue(row.request_id),
    expectedVersion,
    revision: fileRevision({
      ...row,
      id: row.revision_id,
      version: expectedVersion + 1,
    }),
  };
}
async function readFile(
  sql: Sql,
  scope: string,
  id: string,
  revision?: string,
): Promise<FileRevision | null> {
  return (
    (
      await sql.query(
        revision === undefined
          ? `SELECT ${fileColumns} FROM repository_files file JOIN file_revisions revision ON revision.id=file.head_revision_id
     AND revision.file_id=file.id WHERE file.repository_id=$1 AND file.id=$2`
          : `SELECT ${fileColumns} FROM file_revisions revision WHERE repository_id=$1 AND file_id=$2 AND id=$3`,
        revision === undefined ? [scope, id] : [scope, id, revision],
        fileRevision,
      )
    ).rows[0] ?? null
  );
}
function missing(): never {
  throw new FileError(404, "File evidence not found.", "NOT_FOUND");
}
function conflict(): never {
  throw new FileError(409, "File version conflict.", "VERSION_CONFLICT");
}
function receiptConflict(): never {
  throw new FileError(409, "Request identity reused.", "REQUEST_ID_REUSED");
}
async function currentScope(sql: Sql, actor: string, scope: string) {
  const found = await repositoryContentScope(sql, actor, { repositoryId: scope });
  // Repository visibility alone must never publish private original documents or extracted values.
  assertReadable(found.repository.permissions);
  return {
    repositoryId: found.repository.id,
    permissions: found.repository.permissions,
    archived: found.archived,
  };
}
function persistError(error: unknown): never {
  if (error instanceof FileError) throw error;
  if (error && typeof error === "object") {
    const code = Reflect.get(error, "code");
    if (code === "23505" || code === "23503" || code === "23514")
      throw new FileError(409, "File evidence constraint conflict.", "LIFECYCLE_CONFLICT");
  }
  throw error;
}

async function filePage(sql: Sql, scope: string, after?: string) {
  const rows = (
    await sql.query(
      `SELECT ${fileColumns} FROM repository_files file
    JOIN file_revisions revision ON revision.id=file.head_revision_id AND revision.file_id=file.id
    WHERE file.repository_id=$1 AND ($2::uuid IS NULL OR file.id>$2) ORDER BY file.id LIMIT 21`,
      [scope, after ?? null],
      fileRevision,
    )
  ).rows;
  const files = rows.slice(0, 20);
  return { files, next: rows.length > 20 ? (files.at(-1)?.fileId ?? null) : null };
}
async function pendingPage(sql: Sql, actor: string, scope: string, after?: string) {
  const rows = (
    await sql.query(
      `SELECT intent.* FROM file_upload_intents intent
      WHERE intent.repository_id=$1 AND intent.actor_user_id=$2
        AND intent.abandoned_at IS NULL
        AND ($3::uuid IS NULL OR intent.request_id>$3)
        AND NOT EXISTS (
          SELECT 1 FROM file_commands receipt
          WHERE receipt.actor_user_id=intent.actor_user_id
            AND receipt.request_id=intent.request_id
        )
      ORDER BY intent.request_id LIMIT 21`,
      [scope, actor, after ?? null],
      uploadIntent,
    )
  ).rows;
  const intents = rows.slice(0, 20);
  return { intents, next: rows.length > 20 ? (intents.at(-1)?.requestId ?? null) : null };
}

export class PostgresFiles implements FileReads, FileTransactions, FileReclamation {
  constructor(private readonly db: Database = businessDatabase()) {}
  file(actor: string, scope: string, id: string, revision?: string) {
    return this.db.transaction(async (sql) => {
      await currentScope(sql, actor, scope);
      return (await readFile(sql, scope, id, revision)) ?? missing();
    });
  }
  list(actor: string, scope: string, after?: string) {
    return this.db.transaction(async (sql) => {
      await currentScope(sql, actor, scope);
      return filePage(sql, scope, after);
    });
  }
  pendingUploads(actor: string, scope: string, after?: string) {
    return this.db.transaction(async (sql) => {
      await currentScope(sql, actor, scope);
      return pendingPage(sql, actor, scope, after);
    });
  }
  overview(actor: string, scope: string) {
    return this.db.transaction(async (sql) => {
      await currentScope(sql, actor, scope);
      const files = await filePage(sql, scope);
      const pending = await pendingPage(sql, actor, scope);
      return { ...files, intents: pending.intents, pendingNext: pending.next };
    });
  }
  /** No public actor can call these: trusted operator scans only never-committed intents. */
  candidates(beforeAt: number, quietMillis: number) {
    return this.db.transaction(async (sql) => {
      const result = await sql.query(
        `SELECT intent.* FROM file_upload_intents intent
         WHERE (intent.abandoned_at IS NOT NULL
             OR (intent.reclaimed_at IS NULL
                 AND intent.last_attempt_at <= to_timestamp($1::double precision/1000)
                 AND intent.last_attempt_at <= clock_timestamp() - ($2::double precision * interval '1 millisecond')))
           AND NOT EXISTS (
             SELECT 1 FROM file_commands receipt
             WHERE receipt.actor_user_id=intent.actor_user_id
               AND receipt.request_id=intent.request_id
           )
           AND NOT EXISTS (
             SELECT 1 FROM file_revisions revision WHERE revision.id=intent.revision_id
           )
         ORDER BY COALESCE(intent.reclaimed_at,intent.last_attempt_at),
           intent.actor_user_id,intent.request_id LIMIT 20`,
        [beforeAt, quietMillis],
        uploadIntent,
      );
      return result.rows;
    });
  }
  async quarantine(actor: string, requestId: string, beforeAt: number, quietMillis: number) {
    return this.db.transaction(async (sql) => {
      const observed = (
        await sql.query(
          "SELECT repository_id,file_id FROM file_upload_intents WHERE actor_user_id=$1 AND request_id=$2",
          [actor, requestId],
        )
      ).rows[0];
      if (!observed) return null;
      const repositoryId = stringValue(observed.repository_id);
      const fileId = stringValue(observed.file_id);
      // Exactly the same request-then-aggregate advisory lock order as File Upload/Finalize.
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `file-request:${actor}:${requestId}`,
      ]);
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `file-aggregate:${repositoryId}:file:${fileId}`,
      ]);
      const rows = (
        await sql.query(
          `UPDATE file_upload_intents intent
           SET abandoned_at=COALESCE(intent.abandoned_at,clock_timestamp())
           WHERE intent.actor_user_id=$1 AND intent.request_id=$2
             AND intent.repository_id=$3 AND intent.file_id=$4
             AND (intent.abandoned_at IS NOT NULL
               OR (intent.reclaimed_at IS NULL
                   AND intent.last_attempt_at <= to_timestamp($5::double precision/1000)
                   AND intent.last_attempt_at <= clock_timestamp() - ($6::double precision * interval '1 millisecond')))
             AND NOT EXISTS (
               SELECT 1 FROM file_commands receipt
               WHERE receipt.actor_user_id=intent.actor_user_id
                 AND receipt.request_id=intent.request_id
             )
             AND NOT EXISTS (
               SELECT 1 FROM file_revisions revision WHERE revision.id=intent.revision_id
             )
           RETURNING intent.*`,
          [actor, requestId, repositoryId, fileId, beforeAt, quietMillis],
          uploadIntent,
        )
      ).rows;
      return rows[0]?.revision ?? null;
    });
  }
  async markReclaimed(actor: string, requestId: string, revisionId: string) {
    return this.db.transaction(async (sql) => {
      const observed = (
        await sql.query(
          "SELECT repository_id,file_id,revision_id FROM file_upload_intents WHERE actor_user_id=$1 AND request_id=$2",
          [actor, requestId],
        )
      ).rows[0];
      if (!observed || observed.revision_id !== revisionId)
        throw new FileError(409, "Reclamation identity mismatch.", "SOURCE_INVALID");
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `file-request:${actor}:${requestId}`,
      ]);
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `file-aggregate:${stringValue(observed.repository_id)}:file:${stringValue(observed.file_id)}`,
      ]);
      const result = await sql.query(
        `UPDATE file_upload_intents intent SET reclaimed_at=clock_timestamp()
         WHERE intent.actor_user_id=$1 AND intent.request_id=$2 AND intent.revision_id=$3
           AND intent.abandoned_at IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM file_commands receipt
             WHERE receipt.actor_user_id=intent.actor_user_id
               AND receipt.request_id=intent.request_id
           )
           AND NOT EXISTS (
             SELECT 1 FROM file_revisions revision WHERE revision.id=intent.revision_id
           )`,
        [actor, requestId, revisionId],
      );
      if (result.rowCount === 1) return;
      const check = (
        await sql.query(
          `SELECT reclaimed_at FROM file_upload_intents WHERE actor_user_id=$1
           AND request_id=$2 AND revision_id=$3 AND abandoned_at IS NOT NULL`,
          [actor, requestId, revisionId],
        )
      ).rows[0];
      if (!check || check.reclaimed_at === null)
        throw new FileError(409, "Reclamation could not be recorded.", "LIFECYCLE_CONFLICT");
    });
  }
  transact<T>(
    actor: string,
    identity: Readonly<{ repositoryId: string; kind: "file"; id: string }>,
    evidence: Readonly<{ requestId: string; payload: string }>,
    work: (tx: FileTransaction) => Promise<T>,
  ): Promise<T> {
    const fingerprint = createHash("sha256").update(evidence.payload).digest("hex");
    return this.db
      .transaction(async (sql) => {
        const scope = await currentScope(sql, actor, identity.repositoryId);
        await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `file-request:${actor}:${evidence.requestId}`,
        ]);
        await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `file-aggregate:${scope.repositoryId}:${identity.kind}:${identity.id}`,
        ]);
        const guard = (kind: "file", id: string, repositoryId: string) => {
          if (kind !== identity.kind || id !== identity.id || repositoryId !== scope.repositoryId)
            throw new FileError(409, "Foreign file mutation.", "SOURCE_INVALID");
        };
        const tx: FileTransaction = {
          scope,
          nextId: randomUUID,
          uploads: {
            touch: async () => {
              const result = await sql.query(
                `UPDATE file_upload_intents SET last_attempt_at=clock_timestamp()
                 WHERE actor_user_id=$1 AND request_id=$2 AND repository_id=$3
                   AND file_id=$4 AND fingerprint=$5 AND abandoned_at IS NULL`,
                [actor, evidence.requestId, scope.repositoryId, identity.id, fingerprint],
              );
              if (result.rowCount !== 1)
                throw new FileError(
                  409,
                  "Upload intent is no longer active.",
                  "LIFECYCLE_CONFLICT",
                );
            },
            load: async () => {
              const row = (
                await sql.query(
                  `SELECT * FROM file_upload_intents WHERE actor_user_id=$1 AND request_id=$2`,
                  [actor, evidence.requestId],
                )
              ).rows[0];
              if (!row) return null;
              if (
                identity.kind !== "file" ||
                row.repository_id !== scope.repositoryId ||
                row.file_id !== identity.id ||
                row.fingerprint !== fingerprint
              )
                receiptConflict();
              if (row.abandoned_at !== null)
                throw new FileError(409, "Upload intent was quarantined.", "LIFECYCLE_CONFLICT");
              return uploadIntent(row);
            },
            prepare: async (intent) => {
              guard("file", intent.revision.fileId, intent.revision.repositoryId);
              if (intent.requestId !== evidence.requestId) receiptConflict();
              await sql.query(
                `INSERT INTO file_upload_intents (
                   actor_user_id,request_id,repository_id,file_id,revision_id,expected_version,
                   parent_revision_id,at,name,media_type,byte_length,sha256,fingerprint
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                [
                  actor,
                  intent.requestId,
                  scope.repositoryId,
                  intent.revision.fileId,
                  intent.revision.id,
                  intent.expectedVersion,
                  intent.revision.parentRevisionId,
                  intent.revision.at,
                  intent.revision.name,
                  intent.revision.mediaType,
                  intent.revision.byteLength,
                  intent.revision.sha256,
                  fingerprint,
                ],
              );
            },
          },
          files: {
            load: (id, revision) => readFile(sql, scope.repositoryId, id, revision),
            save: async (next, expected) => {
              guard("file", next.fileId, next.repositoryId);
              if (expected === 0)
                await sql.query(
                  `INSERT INTO repository_files(id,repository_id,version,head_revision_id)
       VALUES($1,$2,$3,$4)`,
                  [next.fileId, scope.repositoryId, next.version, next.id],
                );
              await sql.query(
                `INSERT INTO file_revisions(id,file_id,repository_id,version,parent_revision_id,actor_user_id,at,
       name,media_type,byte_length,sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                [
                  next.id,
                  next.fileId,
                  next.repositoryId,
                  next.version,
                  next.parentRevisionId,
                  actor,
                  next.at,
                  next.name,
                  next.mediaType,
                  next.byteLength,
                  next.sha256,
                ],
              );
              if (expected > 0) {
                const result = await sql.query(
                  `UPDATE repository_files SET version=$3,head_revision_id=$4
        WHERE repository_id=$1 AND id=$2 AND version=$5 AND head_revision_id=$6`,
                  [
                    scope.repositoryId,
                    next.fileId,
                    next.version,
                    next.id,
                    expected,
                    next.parentRevisionId,
                  ],
                );
                if (result.rowCount !== 1) conflict();
              }
            },
          },
          replay: async () => {
            const row = (
              await sql.query(
                `SELECT repository_id,kind,entity_id,fingerprint,file_revision_id,processing_revision_id
      FROM file_commands WHERE actor_user_id=$1 AND request_id=$2`,
                [actor, evidence.requestId],
              )
            ).rows[0];
            if (!row) return null;
            if (
              row.repository_id !== scope.repositoryId ||
              row.kind !== identity.kind ||
              row.entity_id !== identity.id ||
              row.fingerprint !== fingerprint
            )
              return receiptConflict();
            const revision = await readFile(
              sql,
              scope.repositoryId,
              identity.id,
              stringValue(row.file_revision_id),
            );
            if (!revision) throw new FileError(503, "File receipt unavailable.", "UNAVAILABLE");
            return { kind: "file", requestId: evidence.requestId, revision };
          },
          record: async (receipt: FileReceipt) => {
            guard(receipt.kind, receipt.revision.fileId, receipt.revision.repositoryId);
            if (receipt.requestId !== evidence.requestId) return receiptConflict();
            await sql.query(
              `INSERT INTO file_commands(actor_user_id,request_id,repository_id,kind,entity_id,fingerprint,file_revision_id,processing_revision_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
              [
                actor,
                evidence.requestId,
                scope.repositoryId,
                identity.kind,
                identity.id,
                fingerprint,
                receipt.revision.id,
                null,
              ],
            );
          },
        };
        return work(tx);
      })
      .catch(persistError);
  }
}

/** Public File qualification uses the caller's transaction and only File-owned metadata. */
export function createPostgresFileRevisionQualifier(sql: Sql): FileRevisionQualifier {
  return {
    async verify(actor, repositoryId, source) {
      const scope = scopeId(repositoryId);
      const fileId = identifier(source.fileId);
      const revisionId = identifier(source.fileRevisionId);
      if (!/^[0-9a-f]{64}$/.test(source.fileSha256))
        throw new FileError(400, "Invalid File source fingerprint.", "INVALID_INPUT");
      await currentScope(sql, actor, scope);
      const revision = await readFile(sql, scope, fileId, revisionId);
      if (!revision) return missing();
      if (revision.sha256 !== source.fileSha256)
        throw new FileError(409, "File source fingerprint differs.", "SOURCE_INVALID");
    },
  };
}
