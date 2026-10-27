import type { FileReads } from "../../contracts/output/files.js";
import type { FileObjectStore } from "../../contracts/output/object-store.js";
import type { FileSourceReader } from "../../contracts/output/references.js";
import { FileError, fileErrorFromUnknown } from "../../domain/error.js";
import { identifier, scopeId } from "../../domain/values.js";

export function createFileSourceReader(deps: {
  reads: Pick<FileReads, "file">;
  objects(): FileObjectStore;
}): FileSourceReader {
  return {
    async read(actor, repositoryId, source, maxBytes) {
      try {
        const scope = scopeId(repositoryId);
        const fileId = identifier(source.fileId);
        const revisionId = identifier(source.fileRevisionId);
        const revision = await deps.reads.file(actor, scope, fileId, revisionId);
        if (maxBytes !== undefined && ( !Number.isSafeInteger(maxBytes) || maxBytes < 1 || revision.byteLength > maxBytes ))
          throw new FileError(413, "File is too large for this transport.", "INVALID_INPUT");
        // Original bytes are read outside database transactions and locks.
        const bytes = await deps.objects().readVerified(revision);
        // Grants or the active actor may change while object I/O is in flight.
        await deps.reads.file(actor, scope, fileId, revisionId);
        return { revision, bytes: Uint8Array.from(bytes) };
      } catch (error) {
        throw fileErrorFromUnknown(error);
      }
    },
  };
}
