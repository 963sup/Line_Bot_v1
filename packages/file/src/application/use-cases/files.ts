import type {
  FilePayloadInspector,
  FileReads,
  FileTransaction,
  FileTransactions,
} from "../../contracts/output/files.js";
import type { FileObjectStore } from "../../contracts/output/object-store.js";
import type { FileProcessor } from "../../contracts/output/processor.js";
import { FileError, fileErrorFromUnknown } from "../../domain/error.js";
import { type FileRevision, type FileUploadIntent, nextFileRevision } from "../../domain/file.js";
import {
  beginProcessing,
  finalizeProcessing,
  finishProcessing,
  type ProcessingOutput,
  type ProcessingRevision,
  processingOutput,
} from "../../domain/processing-run.js";
import { assertWritable, checkVersion, identifier, scopeId } from "../../domain/values.js";
import { processingCommand, resultCommand, uploadCommand } from "../commands/files.js";

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
function outputDto(result: ProcessingOutput | null) {
  return result === null
    ? null
    : {
        documentKind: result.documentKind,
        observations: result.observations.map((o) => ({
          id: o.id,
          label: o.label,
          value: o.value,
          uncertain: o.uncertain,
          source: o.source === null ? null : { ...o.source },
        })),
      };
}
function processingDto(r: ProcessingRevision) {
  return {
    revisionId: r.id,
    repositoryId: r.repositoryId,
    runId: r.runId,
    fileId: r.fileId,
    fileRevisionId: r.fileRevisionId,
    fileSha256: r.fileSha256,
    version: r.version,
    parentRevisionId: r.parentRevisionId,
    actorUserId: r.actorUserId,
    at: r.at,
    state: r.state,
    attemptId: r.attemptId,
    processorId: r.processorId,
    processorVersion: r.processorVersion,
    processorKind: r.processorKind,
    rawResult: outputDto(r.rawResult),
    savedResult: outputDto(r.savedResult),
    edits: r.edits.map((e) => ({ ...e })),
    failure: r.failure,
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
  function context(tx: FileTransaction, actor: string) {
    return {
      id: tx.nextId(),
      repositoryId: tx.scope.repositoryId,
      actorUserId: actor,
      at: deps.now(),
    };
  }
  async function original(actor: string, scope: string, fileId: string, revisionId: string) {
    const revision = await deps.reads.file(actor, scope, fileId, revisionId);
    // The private provider read is outside PostgreSQL transaction/locks.
    const bytes = await deps.objects().readVerified(revision);
    // A revoked Repository grant cannot complete a read initiated while still authorized.
    await deps.reads.file(actor, scope, fileId, revisionId);
    return { revision, bytes };
  }
  return {
    async source(actor: string, scope: string, id: string, revision: string) {
      try {
        const result = await original(actor, scopeId(scope), identifier(id), identifier(revision));
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
    async processingsForFile(actor: string, scope: string, fileId: string, after?: string) {
      try {
        return await deps.reads.processingsForFile(
          actor,
          scopeId(scope),
          identifier(fileId),
          after === undefined ? undefined : identifier(after),
        );
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
    async processing(actor: string, scope: string, id: string, revision?: string) {
      try {
        return processingDto(
          await deps.reads.processing(
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
    async run(actor: string, input: unknown, processor: FileProcessor) {
      const c = processingCommand(input);
      try {
        const start = await deps.transactions.transact(
          actor,
          { repositoryId: c.repositoryId, kind: "processing", id: c.runId },
          {
            requestId: c.requestId,
            payload: JSON.stringify({
              ...c,
              processorId: processor.id,
              processorVersion: processor.version,
            }),
          },
          async (tx) => {
            writable(tx);
            const replay = await tx.replay();
            if (replay) {
              if (replay.kind !== "processing")
                throw new FileError(409, "Request identity reused.", "REQUEST_ID_REUSED");
              // Never repeat a provider call just because its result was lost to the caller.
              return { replayed: true as const, revision: replay.revision };
            }
            newWrite(tx);
            const file = await tx.files.load(c.fileId, c.fileRevisionId);
            if (!file) throw new FileError(404, "Source revision not found.", "NOT_FOUND");
            if (!processor.supports(file.mediaType))
              throw new FileError(
                422,
                "Processor does not support this media type.",
                "UNSUPPORTED_MEDIA",
              );
            const next = beginProcessing(
              await tx.processings.load(c.runId),
              c.expectedVersion,
              c.runId,
              file,
              processor,
              context(tx, actor),
            );
            await tx.processings.save(next, c.expectedVersion);
            await tx.record({ kind: "processing", requestId: c.requestId, revision: next });
            return { replayed: false as const, revision: next, source: file };
          },
        );
        if (start.replayed)
          return {
            requestId: c.requestId,
            replayed: true,
            processing: processingDto(start.revision),
          };
        // Reauthorize and verify the exact source before the selected provider sees bytes.
        const source = await original(actor, c.repositoryId, c.fileId, c.fileRevisionId);
        // No transaction or governance lock spans external processing.
        let rawResult: ProcessingOutput | null = null;
        try {
          rawResult = processingOutput(await processor.run(source));
        } catch {
          /* Only sanitized failure evidence is persisted. */
        }
        const outcome = rawResult;
        const finished = await deps.transactions.transact(
          actor,
          { repositoryId: c.repositoryId, kind: "processing", id: c.runId },
          {
            requestId: start.revision.attemptId,
            payload: JSON.stringify({
              action: "finish",
              attemptId: start.revision.attemptId,
              outcome,
            }),
          },
          async (tx) => {
            writable(tx);
            const replay = await tx.replay();
            if (replay) {
              if (replay.kind !== "processing")
                throw new FileError(409, "Request identity reused.", "REQUEST_ID_REUSED");
              return replay.revision;
            }
            newWrite(tx);
            const current = await tx.processings.load(c.runId);
            if (!current) throw new FileError(404, "Processing not found.", "NOT_FOUND");
            const next = finishProcessing(
              current,
              start.revision.attemptId,
              outcome,
              context(tx, actor),
            );
            await tx.processings.save(next, current.version);
            await tx.record({
              kind: "processing",
              requestId: start.revision.attemptId,
              revision: next,
            });
            return next;
          },
        );
        return { requestId: c.requestId, replayed: false, processing: processingDto(finished) };
      } catch (error) {
        throw fileErrorFromUnknown(error);
      }
    },
    async result(actor: string, input: unknown) {
      const c = resultCommand(input);
      try {
        return await deps.transactions.transact(
          actor,
          { repositoryId: c.repositoryId, kind: "processing", id: c.runId },
          { requestId: c.requestId, payload: JSON.stringify(c) },
          async (tx) => {
            writable(tx);
            const replay = await tx.replay();
            if (replay) {
              if (replay.kind !== "processing")
                throw new FileError(409, "Request identity reused.", "REQUEST_ID_REUSED");
              return { requestId: c.requestId, processing: processingDto(replay.revision) };
            }
            newWrite(tx);
            const current = await tx.processings.load(c.runId);
            if (!current) throw new FileError(404, "Processing not found.", "NOT_FOUND");
            const next = finalizeProcessing(current, c.expectedVersion, c, context(tx, actor));
            await tx.processings.save(next, c.expectedVersion);
            await tx.record({ kind: "processing", requestId: c.requestId, revision: next });
            return { requestId: c.requestId, processing: processingDto(next) };
          },
        );
      } catch (error) {
        throw fileErrorFromUnknown(error);
      }
    },
  };
}
