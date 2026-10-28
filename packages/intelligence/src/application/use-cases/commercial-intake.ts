import { createHash } from "node:crypto";
import type { FileSourceReader } from "@line_bot_v1/file/contracts/output/references";
import {
  type CommercialExtractionResult,
  type CommercialIntake,
  type CommercialIntakeCommand,
  type CommercialIntakeContext,
  CommercialIntakeError,
  type CommercialIntakeStatus,
  type CommercialIntakeTarget,
} from "../../contracts/output/commercial-intake.js";
import type {
  CommercialIntakeStore,
  CommercialJob,
  ExtractionProfile,
} from "../../contracts/ports/commercial-intake.js";
import { stableCommercialId, validateCommercialObservations } from "../commercial-observations.js";
import { commercialFingerprint, commercialProfile } from "../commercial-profile.js";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const canonicalUuid = (value: string) => value.toLowerCase();
function canonicalCommand(command: CommercialIntakeCommand): CommercialIntakeCommand {
  return {
    ...command,
    commandId: canonicalUuid(command.commandId),
    source: { ...command.source, fileId: canonicalUuid(command.source.fileId), fileRevisionId: canonicalUuid(command.source.fileRevisionId) },
    target: { ...command.target, documentId: canonicalUuid(command.target.documentId), draftCommandId: canonicalUuid(command.target.draftCommandId) },
  };
}
function validate(command: CommercialIntakeCommand): void {
  if (
    !command ||
    Object.keys(command).sort().join(",") !== "commandId,repositoryId,source,target" ||
    !uuid.test(command.commandId) ||
    typeof command.repositoryId !== "string" ||
    !command.repositoryId.trim() ||
    command.repositoryId.length > 128 ||
    !command.source ||
    Object.keys(command.source).sort().join(",") !== "fileId,fileRevisionId,sha256" ||
    !uuid.test(command.source.fileId) ||
    !uuid.test(command.source.fileRevisionId) ||
    !/^[a-f0-9]{64}$/.test(command.source.sha256) ||
    !command.target ||
    Object.keys(command.target).sort().join(",") !==
      "documentId,draftCommandId,expectedDocumentVersion" ||
    !uuid.test(command.target.documentId) ||
    !uuid.test(command.target.draftCommandId) ||
    !Number.isSafeInteger(command.target.expectedDocumentVersion) ||
    command.target.expectedDocumentVersion < 0 ||
    command.target.expectedDocumentVersion > 2147483646
  )
    throw new CommercialIntakeError("INVALID_INPUT", 400, "intake.validate");
}
function context(ctx: CommercialIntakeContext) {
  if (
    !ctx ||
    typeof ctx.actorUserId !== "string" ||
    !ctx.actorUserId.trim() ||
    typeof ctx.traceId !== "string" ||
    !ctx.traceId.trim()
  )
    throw new CommercialIntakeError("INVALID_INPUT", 400, "intake.validate");
}
export function createCommercialIntake(deps: {
  persistExtractionResult?(input: {
    actorUserId: string;
    repositoryId: string;
    extractionResultId: string;
    result: CommercialExtractionResult;
  }): Promise<void>;
  assertProviderReady?(): Promise<void>;
  store: CommercialIntakeStore;
  target: CommercialIntakeTarget;
  reader: FileSourceReader;
  inspect(input: {
    bytes: Uint8Array;
    mediaType: string;
    maxInputBytes: number;
    maxPdfPages: number;
  }): Promise<{ pageCount: number }>;
  countInputTokens(input: {
    bytes: Uint8Array;
    mediaType: string;
    profile: ExtractionProfile;
  }): Promise<number>;
  extract(input: {
    bytes: Uint8Array;
    mediaType: string;
    profile: ExtractionProfile;
    timeoutMs: number;
  }): Promise<unknown>;
}): CommercialIntake {
  const { store, target } = deps;
  async function required(
    ctx: CommercialIntakeContext,
    query: { repositoryId: string; commandId: string },
  ) {
    context(ctx);
    if (!uuid.test(query.commandId))
      throw new CommercialIntakeError("INVALID_INPUT", 400, "intake.validate");
    const job = await store.find(ctx.actorUserId, query.repositoryId, query.commandId);
    if (!job) throw new CommercialIntakeError("INTAKE_NOT_FOUND", 404, "intake.read");
    return job;
  }
  async function readReceipt(ctx: CommercialIntakeContext, job: CommercialJob) {
    if (job.state !== "READY" || !job.extractionResultId) return null;
    const receipt = await target.receipt(
      ctx.actorUserId,
      { repositoryId: job.command.repositoryId, commandId: job.command.target.draftCommandId },
      {
        documentId: job.command.target.documentId,
        expectedVersion: job.command.target.expectedDocumentVersion,
        extractionResultId: job.extractionResultId,
      },
    );
    if (
      receipt &&
      (receipt.commandId.toLowerCase() !== job.command.target.draftCommandId.toLowerCase() ||
        receipt.documentId.toLowerCase() !== job.command.target.documentId.toLowerCase() ||
        receipt.documentVersion !== job.command.target.expectedDocumentVersion + 1 ||
        receipt.operation !== "CREATE_DRAFT")
    )
      throw new CommercialIntakeError("COMMAND_ID_CONFLICT", 409, "target.receipt");
    return receipt;
  }
  async function statusFor(
    ctx: CommercialIntakeContext,
    job: CommercialJob,
  ): Promise<CommercialIntakeStatus> {
    const receipt = await readReceipt(ctx, job);
    const state = receipt
      ? "DRAFT_SAVED"
      : job.state === "READY"
        ? "RESULT_READY"
        : job.state === "RESERVED"
          ? "WAITING"
          : job.state === "DISPATCHED"
            ? "ANALYZING"
            : job.state;
    return {
      state,
      commandId: job.command.commandId,
      extractionResultId: job.extractionResultId,
      documentId: job.command.target.documentId,
      receipt,
      failure: job.failure,
    };
  }
  async function save(
    ctx: CommercialIntakeContext,
    job: CommercialJob,
  ): Promise<CommercialIntakeStatus> {
    const current = await statusFor(ctx, job);
    if (current.receipt || job.state !== "READY" || !job.extractionResultId) return current;
    try {
      const receipt = await target.createDraftFromExtraction(ctx, {
        commandId: job.command.target.draftCommandId,
        repositoryId: job.command.repositoryId,
        documentId: job.command.target.documentId,
        expectedVersion: job.command.target.expectedDocumentVersion,
        extractionResultId: job.extractionResultId,
      });
      return { ...current, state: "DRAFT_SAVED", receipt, failure: null };
    } catch (error) {
      // Result is already durable. Only the target command may be replayed.
      const receipt = await readReceipt(ctx, job);
      if (receipt) return { ...current, state: "DRAFT_SAVED", receipt, failure: null };
      return {
        ...current,
        failure: {
          code:
            typeof error === "object" &&
            error !== null &&
            (("status" in error &&
              typeof error.status === "number" &&
              error.status >= 400 &&
              error.status < 500) ||
              ("code" in error &&
                typeof error.code === "string" &&
                /^(22|23)[0-9A-Z]{3}$/.test(error.code)))
              ? "DOCUMENT_SAVE_FAILED"
              : "DOCUMENT_SAVE_OUTCOME_UNKNOWN",
          stage: "target.submit",
        },
      };
    }
  }
  async function execute(
    ctx: CommercialIntakeContext,
    command: CommercialIntakeCommand,
    prior: CommercialJob | null,
  ): Promise<CommercialIntakeStatus> {
    const executionStartedAt = Date.now();
    await store.qualify(ctx.actorUserId, command);
    await target.assertReady(ctx.actorUserId, command.repositoryId);
    await deps.assertProviderReady?.();
    const profile = prior?.profile ?? commercialProfile;
    if (commercialFingerprint(profile) !== commercialFingerprint(commercialProfile))
      throw new CommercialIntakeError("EXTRACTION_PROFILE_INVALID", 503, "extraction.profile");
    const source = await deps.reader.read(
      ctx.actorUserId,
      command.repositoryId,
      { fileId: command.source.fileId, fileRevisionId: command.source.fileRevisionId },
      profile.maxInputBytes,
    );
    if (
      source.revision.id !== command.source.fileRevisionId ||
      source.revision.fileId !== command.source.fileId ||
      source.revision.repositoryId !== command.repositoryId ||
      source.revision.sha256 !== command.source.sha256 ||
      source.revision.byteLength !== source.bytes.byteLength ||
      createHash("sha256").update(source.bytes).digest("hex") !== command.source.sha256
    )
      throw new CommercialIntakeError("SOURCE_INVALID", 422, "source.inspect");
    let pageCount: number;
    try {
      ({ pageCount } = await deps.inspect({
        bytes: source.bytes,
        mediaType: source.revision.mediaType,
        maxInputBytes: profile.maxInputBytes,
        maxPdfPages: profile.maxPdfPages,
      }));
    } catch (error) {
      throw new CommercialIntakeError("SOURCE_INVALID", 422, "source.inspect", { cause: error });
    }
    let inputTokenCount: number;
    try {
      inputTokenCount = await deps.countInputTokens({
        bytes: source.bytes,
        mediaType: source.revision.mediaType,
        profile,
      });
    } catch (error) {
      throw new CommercialIntakeError(
        "SOURCE_TOKEN_COUNT_UNAVAILABLE",
        503,
        "extraction.admission",
        { cause: error },
      );
    }
    if (!Number.isSafeInteger(inputTokenCount) || inputTokenCount < 0)
      throw new CommercialIntakeError(
        "SOURCE_TOKEN_COUNT_UNAVAILABLE",
        503,
        "extraction.admission",
      );
    if (inputTokenCount > profile.inputTokenBudget)
      throw new CommercialIntakeError("SOURCE_TOKEN_BUDGET_EXCEEDED", 413, "extraction.admission");
    if (Date.now() - executionStartedAt >= profile.timeoutMs)
      throw new CommercialIntakeError("EXTRACTION_DEADLINE_EXCEEDED", 503, "extraction.admission");
    const reservation = await store.reserve(
      ctx.actorUserId,
      command,
      commercialFingerprint(command),
      profile,
      { pageCount, byteLength: source.bytes.byteLength, inputTokenCount },
    );
    const job = reservation.job;
    if (!reservation.owned) return statusFor(ctx, job);
    // An uncertain commit never permits a provider call. A durable DISPATCHED job is never reclaimed.
    let dispatched: boolean;
    try {
      dispatched = await store.dispatch(job);
    } catch (error) {
      await store
        .fail(job, "EXTRACTION_OUTCOME_UNKNOWN", "extraction.dispatch", true)
        .catch(() => {});
      throw new CommercialIntakeError("EXTRACTION_OUTCOME_UNKNOWN", 503, "extraction.dispatch", {
        cause: error,
      });
    }
    if (!dispatched)
      return statusFor(
        ctx,
        await required(ctx, { repositoryId: command.repositoryId, commandId: command.commandId }),
      );
    let payload: unknown;
    try {
      payload = await deps.extract({
        bytes: source.bytes,
        mediaType: source.revision.mediaType,
        profile,
        timeoutMs: Math.max(1, profile.timeoutMs - (Date.now() - executionStartedAt)),
      });
    } catch (error) {
      const known =
        error instanceof CommercialIntakeError &&
        ["EXTRACTION_REFUSED", "EXTRACTION_INCOMPLETE", "EXTRACTION_OUTPUT_INVALID"].includes(
          error.code,
        );
      const code = known ? error.code : "EXTRACTION_OUTCOME_UNKNOWN";
      await store.fail(job, code, "extraction.provider", !known);
      throw new CommercialIntakeError(code, known ? 422 : 503, "extraction.provider", {
        cause: error,
      });
    }
    let result: CommercialExtractionResult;
    try {
      const observations = validateCommercialObservations(payload, pageCount);
      const extractionResultId = stableCommercialId(job.id, "result");
      result = {
        extractionResultId,
        repositoryId: command.repositoryId,
        source: command.source,
        pageCount,
        observations: observations.observations.map((value, index) => ({
          ...value,
          observationId: stableCommercialId(extractionResultId, `observation:${index}`),
        })),
        semanticHints: observations.semanticHints,
        wbsDraft: observations.wbsDraft ?? { workRows: [] },
      };
      if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 393_216)
        throw new CommercialIntakeError("EXTRACTION_OUTPUT_INVALID", 422, "extraction.validate");
    } catch (error) {
      await store.fail(job, "EXTRACTION_OUTPUT_INVALID", "extraction.validate", false);
      throw error;
    }
    try {
      await store.complete(job, result);
      await deps.persistExtractionResult?.({
        actorUserId: ctx.actorUserId,
        repositoryId: command.repositoryId,
        extractionResultId: result.extractionResultId,
        result,
      });
    } catch (error) {
      // A lost commit acknowledgement may already have committed result+READY.
      const persisted = await store
        .result(ctx.actorUserId, command.repositoryId, result.extractionResultId)
        .catch(() => null);
      if (!persisted) {
        await store
          .fail(job, "EXTRACTION_OUTCOME_UNKNOWN", "extraction.persist", true)
          .catch(() => {});
        throw new CommercialIntakeError("EXTRACTION_OUTCOME_UNKNOWN", 503, "extraction.persist", {
          cause: error,
        });
      }
    }
    return save(
      ctx,
      await required(ctx, { repositoryId: command.repositoryId, commandId: command.commandId }),
    );
  }
  return {
    async start(ctx, command) {
      context(ctx);
      validate(command);
      command = canonicalCommand(command);
      const prior = await store.find(ctx.actorUserId, command.repositoryId, command.commandId);
      if (prior) {
        if (prior.intent !== commercialFingerprint(command))
          throw new CommercialIntakeError("COMMAND_ID_REUSED", 409, "intake.reserve");
        return statusFor(ctx, prior);
      }
      return execute(ctx, command, null);
    },
    async status(ctx, query) {
      return statusFor(ctx, await required(ctx, query));
    },
    async resume(ctx, query) {
      const job = await required(ctx, query);
      const current = await statusFor(ctx, job);
      if (current.receipt) return current;
      if (job.state === "READY") return save(ctx, job);
      if (job.state === "RESERVED" && job.leaseUntil <= Date.now())
        return execute(ctx, job.command, job);
      return current;
    },
    async readResult(actor, query) {
      if (!uuid.test(query.extractionResultId))
        throw new CommercialIntakeError("INVALID_INPUT", 400, "extraction.read");
      return store.result(actor, query.repositoryId, query.extractionResultId);
    },
  };
}
