import { createHash } from "node:crypto";
import type { DocumentAttempts } from "../../contracts/output/document-attempts.js";
import type {
  DocumentExtractor,
  DocumentIntakeSource,
  IntakeCommand,
  IntakeReceipt,
  IntakeSchema,
  IntakeTarget,
} from "../../contracts/output/document-intake.js";
import { IntakeError } from "../../contracts/output/document-intake.js";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(Reflect.get(value, key))}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonicalUuid(value: string): string {
  if (!uuid.test(value)) throw new IntakeError("INVALID_INPUT", 422);
  return value.toLowerCase();
}

function canonicalCommand(command: IntakeCommand): IntakeCommand {
  if (command.action !== "save") throw new IntakeError("INVALID_INPUT", 422);
  if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0)
    throw new IntakeError("INVALID_INPUT", 422);
  if (!Number.isSafeInteger(command.expectedLineCount) || command.expectedLineCount < 1)
    throw new IntakeError("INVALID_INPUT", 422);
  if (!/^[a-f0-9]{64}$/i.test(command.source.fileSha256))
    throw new IntakeError("INVALID_INPUT", 422);
  return {
    action: "save",
    repositoryId: command.repositoryId,
    documentId: canonicalUuid(command.documentId),
    requestId: canonicalUuid(command.requestId),
    expectedVersion: command.expectedVersion,
    expectedLineCount: command.expectedLineCount,
    source: {
      fileId: canonicalUuid(command.source.fileId),
      fileRevisionId: canonicalUuid(command.source.fileRevisionId),
      fileSha256: command.source.fileSha256.toLowerCase(),
    },
  };
}

function intakeIntentFingerprint(input: {
  command: IntakeCommand;
  schema: IntakeSchema;
  processorId: string;
  processorVersion: string;
}): string {
  const { command, schema } = input;
  return sha256(
    stable({
      action: command.action,
      repositoryId: command.repositoryId,
      documentId: command.documentId,
      requestId: command.requestId,
      expectedVersion: command.expectedVersion,
      source: command.source,
      schemaId: schema.id,
      schemaVersion: schema.version,
      processorId: input.processorId,
      processorVersion: input.processorVersion,
      expectedLineCount: command.expectedLineCount,
    }),
  );
}

export function createDocumentIntake<Receipt extends IntakeReceipt>(dependencies: {
  reader: DocumentIntakeSource;
  target: IntakeTarget<Receipt>;
  attempts: DocumentAttempts;
  extractor: DocumentExtractor;
  schema: IntakeSchema;
  onTargetSubmit?: () => void;
}) {
  return async function intake(actor: string, rawCommand: IntakeCommand): Promise<Receipt> {
    const command = canonicalCommand(rawCommand);
    const intentFingerprint = intakeIntentFingerprint({
      command,
      schema: dependencies.schema,
      processorId: dependencies.extractor.id,
      processorVersion: dependencies.extractor.version,
    });
    const attemptInput = {
      requestId: command.requestId,
      repositoryId: command.repositoryId,
      source: command.source,
      intentFingerprint,
    };
    const attempt = await dependencies.attempts.reserve(actor, attemptInput);
    const scope = {
      repositoryId: command.repositoryId,
      documentId: command.documentId,
      requestId: command.requestId,
    };
    const prior = await dependencies.target.receipt(actor, scope);
    if (prior) {
      if (
        prior.intentFingerprint !== intentFingerprint ||
        prior.repositoryId !== command.repositoryId ||
        prior.documentId !== command.documentId ||
        prior.requestId !== command.requestId ||
        prior.source.fileId !== command.source.fileId ||
        prior.source.fileRevisionId !== command.source.fileRevisionId ||
        prior.source.fileSha256 !== command.source.fileSha256
      )
        throw new IntakeError("REPLAY_CONFLICT", 409);
      await dependencies.attempts.complete(
        actor,
        { ...attemptInput, id: attempt.id },
        {
          documentId: prior.documentId,
          revisionId: prior.revisionId,
        },
      );
      return prior;
    }
    if (!attempt.fresh) throw new IntakeError("UNKNOWN_RESULT", 503);
    try {
      const { revision, bytes } = await dependencies.reader.read(actor, command.repositoryId, {
        fileId: command.source.fileId,
        fileRevisionId: command.source.fileRevisionId,
      });
      if (
        revision.id !== command.source.fileRevisionId ||
        revision.sha256 !== command.source.fileSha256
      )
        throw new IntakeError("SOURCE_MISMATCH", 409);
      const candidate = await dependencies.extractor.extract({
        bytes,
        mediaType: revision.mediaType,
        schema: dependencies.schema,
        expectedLineCount: command.expectedLineCount,
      });
      dependencies.onTargetSubmit?.();
      const receipt = await dependencies.target.submit(actor, {
        ...command,
        intentFingerprint,
        candidate,
      });
      try {
        await dependencies.attempts.complete(
          actor,
          { ...attemptInput, id: attempt.id },
          {
            documentId: receipt.documentId,
            revisionId: receipt.revisionId,
          },
        );
      } catch {
        throw new IntakeError("UNKNOWN_RESULT", 503);
      }
      return receipt;
    } catch (error) {
      try {
        await dependencies.attempts.unknown(actor, { ...attemptInput, id: attempt.id });
      } catch {}
      throw error;
    }
  };
}
