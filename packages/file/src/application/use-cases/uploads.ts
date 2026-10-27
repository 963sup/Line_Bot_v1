import type {
  FilePayloadInspector,
  FileTransaction,
  FileTransactions,
} from "../../contracts/output/files.js";
import type { FileObjectStore } from "../../contracts/output/object-store.js";
import { FileError, fileErrorFromUnknown } from "../../domain/error.js";
import { type FileDescriptor, type FileUploadIntent, nextFileRevision } from "../../domain/file.js";
import { assertWritable, checkVersion } from "../../domain/values.js";
import { directUploadCommand, uploadCommand } from "../commands/files.js";
import { fileDto } from "../file-projections.js";

function newWrite(tx: FileTransaction): void {
  if (tx.scope.archived) throw new FileError(409, "Repository is archived.", "LIFECYCLE_CONFLICT");
}

/** One command owner for durable intent, object I/O and atomic File revision commit. */
export function createFileUploads(deps: {
  transactions: FileTransactions;
  payloads: FilePayloadInspector;
  objects: () => FileObjectStore;
  now(): number;
}) {
  type UploadDetails = ReturnType<typeof uploadCommand>;
  function uploadIdentity(c: UploadDetails) {
    return { repositoryId: c.repositoryId, kind: "file" as const, id: c.fileId };
  }
  function uploadEvidence(c: UploadDetails, descriptor: FileDescriptor) {
    // The same payload fingerprint is used by legacy CLI and signed Web upload.
    return {
      requestId: c.requestId,
      payload: JSON.stringify({
        ...c,
        descriptor: {
          name: descriptor.name,
          mediaType: descriptor.mediaType,
          byteLength: descriptor.byteLength,
          sha256: descriptor.sha256,
        },
      }),
    };
  }
  async function prepareUploadIntent(
    actor: string,
    c: UploadDetails,
    descriptor: FileDescriptor,
    mode: "prepare" | "resume",
  ) {
    return deps.transactions.transact(
      actor,
      uploadIdentity(c),
      uploadEvidence(c, descriptor),
      async (tx) => {
        assertWritable(tx.scope.permissions);
        const replay = await tx.replay();
        if (replay) return { committed: true as const, revision: replay.revision };
        newWrite(tx);
        const pending = await tx.uploads.load();
        if (!pending && mode === "resume")
          throw new FileError(409, "Upload intent was not prepared.", "LIFECYCLE_CONFLICT");
        const current = await tx.files.load(c.fileId);
        checkVersion(current, c.expectedVersion);
        if (pending) {
          await tx.uploads.touch();
          return { committed: false as const, intent: pending };
        }
        const revision = nextFileRevision(current, c.expectedVersion, c.fileId, descriptor, {
          id: tx.nextId(),
          repositoryId: tx.scope.repositoryId,
          actorUserId: actor,
          at: deps.now(),
        });
        const intent: FileUploadIntent = {
          requestId: c.requestId,
          expectedVersion: c.expectedVersion,
          revision,
        };
        await tx.uploads.prepare(intent);
        return { committed: false as const, intent };
      },
    );
  }
  async function finalize(actor: string, c: UploadDetails, descriptor: FileDescriptor) {
    return deps.transactions.transact(
      actor,
      uploadIdentity(c),
      uploadEvidence(c, descriptor),
      async (tx) => {
        assertWritable(tx.scope.permissions);
        const replay = await tx.replay();
        if (replay) return { requestId: c.requestId, file: fileDto(replay.revision) };
        newWrite(tx);
        const intent = await tx.uploads.load();
        if (!intent) throw new FileError(503, "Upload intent unavailable.", "UNAVAILABLE");
        const current = await tx.files.load(c.fileId);
        const next = nextFileRevision(
          current,
          intent.expectedVersion,
          c.fileId,
          intent.revision,
          intent.revision,
        );
        await tx.files.save(next, intent.expectedVersion);
        await tx.record({ kind: "file", requestId: c.requestId, revision: next });
        return { requestId: c.requestId, file: fileDto(next) };
      },
    );
  }

  return {
    /** Prepare an immutable request before allowing an untrusted browser to write bytes. */
    async prepareUpload(actor: string, input: unknown) {
      try {
        const { descriptor, ...c } = directUploadCommand(input);
        const prepared = await prepareUploadIntent(actor, c, descriptor, "prepare");
        if (prepared.committed) return { requestId: c.requestId, file: fileDto(prepared.revision) };
        const objects = deps.objects();
        const sign = objects.signUpload;
        if (!sign) throw new FileError(503, "Signed uploads are unavailable.", "UNAVAILABLE");
        const signedUrl = await sign.call(objects, prepared.intent.revision);
        // Signing is external I/O: do not disclose a capability after access was revoked.
        const current = await prepareUploadIntent(actor, c, descriptor, "resume");
        if (current.committed) return { requestId: c.requestId, file: fileDto(current.revision) };
        return { requestId: c.requestId, signedUrl, revisionId: prepared.intent.revision.id };
      } catch (error) {
        throw fileErrorFromUnknown(error);
      }
    },
    /** Finalize only after an independent Storage read proves digest and exact length. */
    async completeUpload(actor: string, input: unknown) {
      try {
        const { descriptor, ...c } = directUploadCommand(input);
        const prepared = await prepareUploadIntent(actor, c, descriptor, "resume");
        if (prepared.committed) return { requestId: c.requestId, file: fileDto(prepared.revision) };
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
        const prepared = await prepareUploadIntent(actor, c, payload.descriptor, "prepare");
        if (prepared.committed) return { requestId: c.requestId, file: fileDto(prepared.revision) };
        await deps.objects().putVerified(prepared.intent.revision, payload.bytes);
        return await finalize(actor, c, payload.descriptor);
      } catch (error) {
        throw fileErrorFromUnknown(error);
      }
    },
  };
}
