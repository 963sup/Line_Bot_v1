import type { FileReads } from "../../contracts/output/files.js";
import type { FileObjectStore } from "../../contracts/output/object-store.js";
import type { FileSourceReader } from "../../contracts/output/references.js";
import { fileErrorFromUnknown } from "../../domain/error.js";
import { identifier, scopeId } from "../../domain/values.js";

export function createFileSourceReader(deps: {
  reads: Pick<FileReads, "file">;
  objects(): FileObjectStore;
}): FileSourceReader {
  return {
    async read(actor, repositoryId, source) {
      try {
        const scope = scopeId(repositoryId);
        const fileId = identifier(source.fileId);
        const revisionId = identifier(source.fileRevisionId);
        const revision = await deps.reads.file(actor, scope, fileId, revisionId);
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
