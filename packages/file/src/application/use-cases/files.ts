import type {
  FilePayloadInspector,
  FileReads,
  FileTransaction,
  FileTransactions,
} from "../../contracts/output/files.js";
import type { FileObjectStore } from "../../contracts/output/object-store.js";
import { FileError, fileErrorFromUnknown } from "../../domain/error.js";
import { type FileRevision, type FileUploadIntent, nextFileRevision } from "../../domain/file.js";
import { assertWritable, checkVersion, identifier, scopeId } from "../../domain/values.js";
import { uploadCommand } from "../commands/files.js";
import { createFileSourceReader } from "./sources.js";

function fileDto(r: FileRevision) {
  return {
    revisionId: r.id,
    repositoryId: r.repositoryId,
    fileId: r.fileId,
    version: r.version,
    parentRevisionId: r.parentRevisionId,
    actorUserId: r.actorUserId,
    at: r.at,
    name: r.name,
    mediaType: r.mediaType,
    byteLength: r.byteLength,
    sha256: r.sha256,
  };
}
function writable(tx: FileTransaction): void {
  assertWritable(tx.scope.permissions);
}
function newWrite(tx: FileTransaction): void {
  if (tx.scope.archived) throw new FileError(409, "Repository is archived.", "LIFECYCLE_CONFLICT");
}

export function createFiles(deps: {
  reads: FileReads;
  transactions: FileTransactions;
  payloads: FilePayloadInspector;
  objects: () => FileObjectStore;
  now(): number;
}) {
  const sources = createFileSourceReader(deps);
  function context(tx: FileTransaction, actor: string) {
    return {
      id: tx.nextId(),
      repositoryId: tx.scope.repositoryId,
      actorUserId: actor,
      at: deps.now(),
    };
  }
  return {
    async source(actor: string, scope: string, id: string, revision: string) {
      try {
        const result = await sources.read(actor, scope, { fileId: id, fileRevisionId: revision });
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
    async pendingUploads(actor: string, scope: string, after?: string) {
      try {
        const page = await deps.reads.pendingUploads(
          actor,
          scopeId(scope),
          after === undefined ? undefined : identifier(after),
        );
        return {
          uploads: page.intents.map((intent) => ({
            requestId: intent.requestId,
            fileId: intent.revision.fileId,
            revisionId: intent.revision.id,
            expectedVersion: intent.expectedVersion,
            name: intent.revision.name,
            mediaType: intent.revision.mediaType,
            byteLength: intent.revision.byteLength,
            sha256: intent.revision.sha256,
          })),
          next: page.next,
        };
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
    async upload(actor: string, input: unknown, bytes: Uint8Array) {
      const c = uploadCommand(input);
      const payload = deps.payloads.inspect(bytes, c.name, c.mediaType);
      const identity = { repositoryId: c.repositoryId, kind: "file" as const, id: c.fileId };
      const evidence = {
        requestId: c.requestId,
        payload: JSON.stringify({ ...c, descriptor: payload.descriptor }),
      };
      try {
        // First commit an immutable intent; do not hold any DB lock over object I/O.
        const prepared = await deps.transactions.transact(actor, identity, evidence, async (tx) => {
          writable(tx);
          const replay = await tx.replay();
          if (replay) {
            if (replay.kind !== "file")
              throw new FileError(409, "Request identity reused.", "REQUEST_ID_REUSED");
            return { committed: true as const, revision: replay.revision };
          }
          newWrite(tx);
          const pending = await tx.uploads.load();
          const current = await tx.files.load(c.fileId);
          checkVersion(current, c.expectedVersion);
          if (pending) {
            await tx.uploads.touch();
            return { committed: false as const, intent: pending };
          }
          const revision = nextFileRevision(
            current,
            c.expectedVersion,
            c.fileId,
            payload.descriptor,
            context(tx, actor),
          );
          const intent: FileUploadIntent = {
            requestId: c.requestId,
            expectedVersion: c.expectedVersion,
            revision,
          };
          await tx.uploads.prepare(intent);
          return { committed: false as const, intent };
        });
        if (prepared.committed) return { requestId: c.requestId, file: fileDto(prepared.revision) };

        // A successful upload is not yet a visible File revision. Readback checks exact bytes.
        await deps.objects().putVerified(prepared.intent.revision, payload.bytes);

        return await deps.transactions.transact(actor, identity, evidence, async (tx) => {
          writable(tx);
          const replay = await tx.replay();
          if (replay) {
            if (replay.kind !== "file")
              throw new FileError(409, "Request identity reused.", "REQUEST_ID_REUSED");
            return { requestId: c.requestId, file: fileDto(replay.revision) };
          }
          newWrite(tx);
          const intent = await tx.uploads.load();
          if (!intent) throw new FileError(503, "Upload intent unavailable.", "UNAVAILABLE");
          const { revision: preparedRevision } = intent;
          const current = await tx.files.load(c.fileId);
          const next = nextFileRevision(
            current,
            intent.expectedVersion,
            c.fileId,
            preparedRevision,
            preparedRevision,
          );
          await tx.files.save(next, intent.expectedVersion);
          await tx.record({ kind: "file", requestId: c.requestId, revision: next });
          return { requestId: c.requestId, file: fileDto(next) };
        });
      } catch (error) {
        throw fileErrorFromUnknown(error);
      }
    },
  };
}
