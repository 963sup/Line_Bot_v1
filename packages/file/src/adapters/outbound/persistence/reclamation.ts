import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { stringValue } from "@line_bot_v1/platform/validation";
import type { FileReclamation } from "../../../contracts/output/files.js";
import { FileError } from "../../../domain/error.js";
import { uploadIntent } from "./files.js";

/** Operator-only persistence: never available through the ordinary Web File owner. */
export class PostgresFileReclamation implements FileReclamation {
  constructor(private readonly db: Database = businessDatabase()) {}
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
}
