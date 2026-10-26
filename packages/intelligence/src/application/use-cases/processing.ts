import { createHash } from "node:crypto";
import type { FileSourceReader } from "@line_bot_v1/file/contracts/output/references";
import type { IntelligenceProcessingStore } from "../../contracts/output/processing.js";
import {
  beginProcessing,
  finalizeProcessing,
  finishProcessing,
  type ProcessingOutput,
} from "../../domain/processing.js";

export type IntelligenceProcessor = Readonly<{
  id: string;
  version: string;
  kind: "parser" | "ocr" | "ai";
  supports(mediaType: string): boolean;
  run(
    source: Readonly<{
      revision: import("@line_bot_v1/file/domain/file").FileRevision;
      bytes: Uint8Array;
    }>,
  ): Promise<ProcessingOutput>;
}>;
function completionRequestId(requestId: string) {
  const bytes = createHash("sha256")
    .update(`intelligence-processing-complete:${requestId}`)
    .digest();
  bytes[6] = (bytes.readUInt8(6) & 0x0f) | 0x50;
  bytes[8] = (bytes.readUInt8(8) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
export function createIntelligenceProcessing(
  deps: Readonly<{ source: FileSourceReader; store: IntelligenceProcessingStore; now(): number }>,
) {
  return {
    async list(actor: string, repositoryId: string, fileId: string, after?: string) {
      const page = await deps.store.list(actor, repositoryId, fileId, after);
      return {
        runs: page.runs.map((revision) => ({
          runId: revision.runId,
          fileId: revision.fileId,
          fileRevisionId: revision.fileRevisionId,
          state: revision.state,
          version: revision.version,
          processorId: revision.processorId,
          processorKind: revision.processorKind,
          at: revision.at,
        })),
        next: page.next,
      };
    },
    async read(actor: string, repositoryId: string, runId: string, revisionId?: string) {
      const revision = await deps.store.read(actor, repositoryId, runId, revisionId);
      if (!revision) throw new Error("NOT_FOUND");
      return {
        runId: revision.runId,
        fileId: revision.fileId,
        fileRevisionId: revision.fileRevisionId,
        state: revision.state,
        version: revision.version,
        processorId: revision.processorId,
        processorKind: revision.processorKind,
        at: revision.at,
        repositoryId: revision.repositoryId,
        revisionId: revision.id,
        processorVersion: revision.processorVersion,
        rawResult: revision.rawResult,
        savedResult: revision.savedResult,
      };
    },
    async run(
      actor: string,
      command: Readonly<{
        repositoryId: string;
        requestId: string;
        runId: string;
        fileId: string;
        fileRevisionId: string;
        expectedVersion: number;
      }>,
      processor: IntelligenceProcessor,
    ) {
      const source = await deps.source.read(actor, command.repositoryId, {
        fileId: command.fileId,
        fileRevisionId: command.fileRevisionId,
      });
      if (!processor.supports(source.revision.mediaType)) throw new Error("UNSUPPORTED_MEDIA");
      const input = {
        repositoryId: command.repositoryId,
        requestId: command.requestId,
        runId: command.runId,
        expectedVersion: command.expectedVersion,
        action: "run" as const,
        source: {
          fileId: command.fileId,
          fileRevisionId: command.fileRevisionId,
          fileSha256: source.revision.sha256,
        },
        processorId: processor.id,
        processorVersion: processor.version,
      };
      // A committed STARTED receipt is not permission to run a processor again.
      // The transaction callback executes only for a newly accepted command.
      let created = false;
      const started = await deps.store.transact(actor, input, async (tx) => {
        await tx.qualifySource(input.source);
        if (
          tx.archived ||
          !tx.permissions.some((permission) => ["write", "maintain", "admin"].includes(permission))
        )
          throw new Error("FORBIDDEN");
        const replay = await tx.replay();
        if (replay) {
          if (!replay.exact) throw new Error("REQUEST_ID_REUSED");
          return replay.revision;
        }
        const current = await tx.load();
        if ((current?.version ?? 0) !== command.expectedVersion)
          throw new Error("VERSION_CONFLICT");
        const next = beginProcessing({
          id: tx.nextId(),
          runId: command.runId,
          actorUserId: actor,
          at: deps.now(),
          file: source.revision,
          processor,
        });
        await tx.save(next, command.expectedVersion);
        await tx.record(next);
        created = true;
        return next;
      });
      if (!created) return { requestId: command.requestId, processing: started };
      let output: ProcessingOutput | null = null;
      try {
        output = await processor.run(source);
      } catch {}
      const latest = await deps.store.read(actor, command.repositoryId, command.runId);
      if (!latest || latest.attemptId !== started.attemptId) throw new Error("PROCESSING_FENCED");
      const completionCommand = {
        ...input,
        expectedVersion: latest.version,
        action: "run" as const,
      };
      const processing = await deps.store.transact(
        actor,
        { ...completionCommand, requestId: completionRequestId(command.requestId) },
        async (tx) => {
          const current = await tx.load();
          if (!current || current.attemptId !== started.attemptId)
            throw new Error("PROCESSING_FENCED");
          const done = finishProcessing(current, {
            id: tx.nextId(),
            actorUserId: actor,
            at: deps.now(),
            result: output,
          });
          await tx.save(done, current.version);
          await tx.record(done);
          return done;
        },
      );
      return { requestId: command.requestId, processing };
    },
    async result(
      actor: string,
      command: Readonly<{
        repositoryId: string;
        requestId: string;
        runId: string;
        expectedVersion: number;
        action: "save" | "discard";
        edits?: readonly unknown[];
      }>,
    ) {
      const processing = await deps.store.transact(
        actor,
        {
          repositoryId: command.repositoryId,
          requestId: command.requestId,
          runId: command.runId,
          expectedVersion: command.expectedVersion,
          action: command.action,
          edits: command.edits ?? [],
        },
        async (tx) => {
          const replay = await tx.replay();
          if (replay) {
            if (!replay.exact) throw new Error("REQUEST_ID_REUSED");
            return replay.revision;
          }
          const current = await tx.load();
          if (!current || current.version !== command.expectedVersion)
            throw new Error("VERSION_CONFLICT");
          const next = finalizeProcessing(current, {
            id: tx.nextId(),
            actorUserId: actor,
            at: deps.now(),
            action: command.action,
            edits: command.edits ?? [],
          });
          await tx.save(next, current.version);
          await tx.record(next);
          return next;
        },
      );
      return { requestId: command.requestId, processing };
    },
  };
}
