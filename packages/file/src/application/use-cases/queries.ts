import type { FileReads } from "../../contracts/output/files.js";
import type { FileObjectStore } from "../../contracts/output/object-store.js";
import { fileErrorFromUnknown } from "../../domain/error.js";
import { identifier, scopeId } from "../../domain/values.js";
import { fileDto, pendingDto } from "../file-projections.js";
import { createFileSourceReader } from "./sources.js";

/** Read-only File capabilities never require upload/reclamation dependencies. */
export function createFileQueries(deps: {
  reads: FileReads;
  objects: () => FileObjectStore;
}) {
  const sources = createFileSourceReader(deps);
  return {
    async source(actor: string, scope: string, id: string, revision: string, maxBytes?: number) {
      try {
        const result = await sources.read(
          actor,
          scope,
          { fileId: id, fileRevisionId: revision },
          maxBytes,
        );
        return { file: fileDto(result.revision), bytes: result.bytes };
      } catch (error) {
        throw fileErrorFromUnknown(error);
      }
    },
    async list(actor: string, scope: string, after?: string) {
      try {
        const page = await deps.reads.list(
          actor,
          scopeId(scope),
          after === undefined ? undefined : identifier(after),
        );
        return { files: page.files.map(fileDto), next: page.next };
      } catch (error) {
        throw fileErrorFromUnknown(error);
      }
    },
    async overview(actor: string, scope: string) {
      try {
        const page = await deps.reads.overview(actor, scopeId(scope));
        return {
          files: page.files.map(fileDto),
          next: page.next,
          uploads: page.intents.map(pendingDto),
          pendingNext: page.pendingNext,
        };
      } catch (error) {
        throw fileErrorFromUnknown(error);
      }
    },
    async pendingUploads(actor: string, scope: string, after?: string) {
      try {
        const page = await deps.reads.pendingUploads(
          actor,
          scopeId(scope),
          after === undefined ? undefined : identifier(after),
        );
        return { uploads: page.intents.map(pendingDto), next: page.next };
      } catch (error) {
        throw fileErrorFromUnknown(error);
      }
    },
    async file(actor: string, scope: string, id: string, revision?: string) {
      try {
        return fileDto(
          await deps.reads.file(
            actor,
            scopeId(scope),
            identifier(id),
            revision === undefined ? undefined : identifier(revision),
          ),
        );
      } catch (error) {
        throw fileErrorFromUnknown(error);
      }
    },

  };
}
