import { createPostgresFileRevisionQualifier } from "@line_bot_v1/file/composition/bootstrap/files";
import { FileError } from "@line_bot_v1/file/domain/error";
import type { Sql, SqlRow } from "@line_bot_v1/platform/postgres";
import { booleanValue, stringValue } from "@line_bot_v1/platform/validation";
import type {
  ProcessingHistoryReader,
  SavedProcessingReference,
  VerifiedSavedProcessing,
} from "../../../contracts/output/processing-history.js";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const sha256 = /^[a-f0-9]{64}$/;
const observationId = /^[A-Za-z0-9_-]{1,80}$/;

function missing(): never {
  throw new FileError(404, "Saved Intelligence result was not found.", "NOT_FOUND");
}

function reference(value: SavedProcessingReference): SavedProcessingReference {
  if (
    !uuid.test(value.runId) ||
    !uuid.test(value.processingRevisionId) ||
    !observationId.test(value.observationId)
  )
    return missing();
  return {
    runId: value.runId.toLowerCase(),
    processingRevisionId: value.processingRevisionId.toLowerCase(),
    observationId: value.observationId,
  };
}

function result(row: SqlRow): VerifiedSavedProcessing {
  const raw = row.saved_result;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return missing();
  const observations = Reflect.get(raw, "observations");
  if (!Array.isArray(observations)) return missing();
  const selected = observations.find(
    (item) =>
      item &&
      typeof item === "object" &&
      Reflect.get(item, "id") === stringValue(row.observation_id),
  );
  if (!selected || Reflect.get(selected, "value") === null) return missing();
  return {
    repositoryId: stringValue(row.repository_id),
    fileId: stringValue(row.file_id),
    fileRevisionId: stringValue(row.file_revision_id),
    fileSha256: stringValue(row.file_sha256),
    runId: stringValue(row.run_id),
    processingRevisionId: stringValue(row.processing_revision_id),
    observationId: stringValue(row.observation_id),
    uncertain: booleanValue(Reflect.get(selected, "uncertain")),
  };
}

/**
 * Temporary retention adapter for immutable legacy rows. It is deliberately
 * read-only: new processing writes must use an Intelligence-owned command
 * store, while this adapter preserves historical evidence during cutover.
 */
export function createPostgresProcessingHistoryReader(sql: Sql): ProcessingHistoryReader {
  return {
    async verifySaved(actor, repositoryId, rawReference) {
      const selected = reference(rawReference);
      const row = (
        await sql.query(
          `SELECT revision.repository_id,revision.file_id,revision.file_revision_id,revision.file_sha256,
                  revision.run_id,revision.id AS processing_revision_id,revision.saved_result,$3 AS observation_id
             FROM file_processing_revisions revision
             WHERE revision.repository_id=$1 AND revision.run_id=$2 AND revision.id=$4
               AND revision.state='SAVED'`,
          [repositoryId, selected.runId, selected.observationId, selected.processingRevisionId],
        )
      ).rows[0];
      if (!row) return missing();
      const verified = result(row);
      if (!sha256.test(verified.fileSha256)) return missing();
      await createPostgresFileRevisionQualifier(sql).verify(actor, repositoryId, {
        fileId: verified.fileId,
        fileRevisionId: verified.fileRevisionId,
        fileSha256: verified.fileSha256,
      });
      return verified;
    },
  };
}
