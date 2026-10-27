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
import { directUploadCommand, uploadCommand } from "../commands/files.js";
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
function pendingDto(intent: FileUploadIntent) {
  return {
    requestId: intent.requestId,
    fileId: intent.revision.fileId,
    revisionId: intent.revision.id,
    expectedVersion: intent.expectedVersion,
    name: intent.revision.name,
    mediaType: intent.revision.mediaType,
    byteLength: intent.revision.byteLength,
    sha256: intent.revision.sha256,
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

  type UploadDetails = ReturnType<typeof uploadCommand>;
  function uploadIdentity(c: UploadDetails) {
    return { repositoryId: c.repositoryId, kind: "file" as const, id: c.fileId };
  }
  function uploadEvidence(c: UploadDetails, descriptor: FileRevision | {
    name: string; mediaType: string; byteLength: number; sha256: string
  }) {
    // The same payload fingerprint is used by legacy CLI and signed Web upload.
    return { requestId: c.requestId, payload: JSON.stringify({ ...c, descriptor: {
      name: descriptor.name, mediaType: descriptor.mediaType,
      byteLength: descriptor.byteLength, sha256: descriptor.sha256,
    } }) };
  }
  async function prepare(actor: string, c: UploadDetails, descriptor: {
    name: string; mediaType: string; byteLength: number; sha256: string
  }) {
    return deps.transactions.transact(actor, uploadIdentity(c), uploadEvidence(c, descriptor), async (tx) => {
      writable(tx);
      const replay = await tx.replay();
      if (replay) return { committed: true as const, revision: replay.revision };
      newWrite(tx);
      const pending = await tx.uploads.load();
      const current = await tx.files.load(c.fileId);
      checkVersion(current, c.expectedVersion);
      if (pending) {
        await tx.uploads.touch();
        return { committed: false as const, intent: pending };
      }
      const revision = nextFileRevision(
        current, c.expectedVersion, c.fileId, descriptor, context(tx, actor)
      );
      const intent: FileUploadIntent = {
        requestId: c.requestId, expectedVersion: c.expectedVersion, revision,
      };
      await tx.uploads.prepare(intent);
      return { committed: false as const, intent };
    });
  }
  async function pending(actor: string, c: UploadDetails, descriptor: {
    name: string; mediaType: string; byteLength: number; sha256: string
  }) {
    return deps.transactions.transact(actor, uploadIdentity(c), uploadEvidence(c, descriptor), async (tx) => {
      writable(tx);
      const replay = await tx.replay();
      if (replay) return { committed: true as const, revision: replay.revision };
      newWrite(tx);
      const intent = await tx.uploads.load();
      if (!intent) throw new FileError(409, "Upload intent was not prepared.", "LIFECYCLE_CONFLICT");
      const current = await tx.files.load(c.fileId);
      checkVersion(current, intent.expectedVersion);
      await tx.uploads.touch();
      return { committed: false as const, intent };
    });
  }
  async function finalize(actor: string, c: UploadDetails, descriptor: {
    name: string; mediaType: string; byteLength: number; sha256: string
  }) {
    return deps.transactions.transact(actor, uploadIdentity(c), uploadEvidence(c, descriptor), async (tx) => {
      writable(tx);
      const replay = await tx.replay();
      if (replay) return { requestId: c.requestId, file: fileDto(replay.revision) };
      newWrite(tx);
      const intent = await tx.uploads.load();
      if (!intent) throw new FileError(503, "Upload intent unavailable.", "UNAVAILABLE");
      const current = await tx.files.load(c.fileId);
      const next = nextFileRevision(
        current, intent.expectedVersion, c.fileId, intent.revision, intent.revision,
      );
      await tx.files.save(next, intent.expectedVersion);
      await tx.record({ kind: "file", requestId: c.requestId, revision: next });
      return { requestId: c.requestId, file: fileDto(next) };
    });
  }
  return {
    async source(actor: string, scope: string, id: string, revision: string, maxBytes?: number) {
      try {
        const result = await sources.read(actor, scope, { fileId: id, fileRevisionId: revision }, maxBytes);
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
          files: page.files.map(fileDto), next: page.next,
          uploads: page.intents.map(pendingDto), pendingNext: page.pendingNext,
        };
      } catch (error) {
        throw fileErrorFromUnknown(error);
      }
    },
    async pendingUploads(actor: string, scope: string, after?: string) {
      try {
        const page = await deps.reads.pendingUploads(
          actor, scopeId(scope),
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

    /** Prepare an immutable request before allowing an untrusted browser to write bytes. */
    async prepareUpload(actor: string, input: unknown) {
      try {
        const { descriptor, ...c } = directUploadCommand(input);
        const prepared = await prepare(actor, c, descriptor);
        if (prepared.committed)
          return { requestId: c.requestId, file: fileDto(prepared.revision) };
        const sign = deps.objects().signUpload;
        if (!sign) throw new FileError(503, "Signed uploads are unavailable.", "UNAVAILABLE");
        const signedUrl = await sign.call(deps.objects(), prepared.intent.revision);
        return { requestId: c.requestId, signedUrl, revisionId: prepared.intent.revision.id };
      } catch (error) {
        throw fileErrorFromUnknown(error);
      }
    },
    /** Finalize only after an independent Storage read proves digest and exact length. */
    async completeUpload(actor: string, input: unknown) {
      try {
        const { descriptor, ...c } = directUploadCommand(input);
        const prepared = await pending(actor, c, descriptor);
        if (prepared.committed)
          return { requestId: c.requestId, file: fileDto(prepared.revision) };
        // No database lock is held while downloading and verifying untrusted bytes.
        await deps.objects().readVerified(prepared.intent.revision);
        return await finalize(actor, c, descriptor);
      } catch (error) {
        throw fileErrorFromUnknown(error);
      }
    },
    /** Existing CLI/multipart contract is retained; both transports share File invariants. */
    async upload(actor: string, input: unknown, bytes: Uint8Array) {
      try {
        const c = uploadCommand(input);
        const payload = deps.payloads.inspect(bytes, c.name, c.mediaType);
        const prepared = await prepare(actor, c, payload.descriptor);
        if (prepared.committed)
          return { requestId: c.requestId, file: fileDto(prepared.revision) };
        await deps.objects().putVerified(prepared.intent.revision, payload.bytes);
        return await finalize(actor, c, payload.descriptor);
      } catch (error) {
        throw fileErrorFromUnknown(error);
      }
    },
  };
}
