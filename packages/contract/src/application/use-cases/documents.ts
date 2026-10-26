import { createHash } from "node:crypto";
import type { DocumentIntakeRevisionDto } from "../../contracts/dto/document-intake.js";
import type {
  ContractDocumentIntake,
  DocumentIntakeInput,
} from "../../contracts/input/document-intake.js";
import type { ContractDocumentIntakeTransactions } from "../../contracts/output/document-intake.js";
import {
  type ContractDocumentRevision,
  createDocumentRevision,
} from "../../domain/document-intake.js";
import {
  decodeDocumentSource,
  decodePurchaseOrderCandidate,
  decodeSourceReviewAttestation,
} from "../../domain/document-intake-decoder.js";
import { ContractError, contractErrorFromUnknown } from "../../domain/error.js";
import { canEditContract } from "../../domain/policies/access.js";

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const sha256 = /^[0-9a-f]{64}$/;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return (
    Object.keys(value).length === allowed.length &&
    Object.keys(value).every((key) => allowed.includes(key))
  );
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(Reflect.get(value, key))}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function documentCommandFingerprint(input: DocumentIntakeInput): string {
  return createHash("sha256").update(canonical(input)).digest("hex");
}

function parseDocumentInput(value: unknown): DocumentIntakeInput {
  if (!record(value))
    throw new ContractError(400, "Invalid Contract document command.", "INVALID_INPUT");
  const input = value;
  const allowedKeys = [
    "action",
    "repositoryId",
    "documentId",
    "requestId",
    "intentFingerprint",
    "expectedVersion",
    "source",
    "expectedLineCount",
    "candidate",
    "acknowledgement",
    "sourceReviewAttestation",
  ];
  if (
    !exactKeys(
      input,
      allowedKeys
        .filter((key) => key !== "acknowledgement" && key !== "sourceReviewAttestation")
        .concat(input.acknowledgement === undefined ? [] : ["acknowledgement"])
        .concat(input.sourceReviewAttestation === undefined ? [] : ["sourceReviewAttestation"]),
    )
  )
    throw new ContractError(400, "Unknown Contract document command field.", "INVALID_INPUT");
  const source = input.source;
  if (
    (input.action !== "save" && input.action !== "confirm") ||
    typeof input.repositoryId !== "string" ||
    input.repositoryId.length < 1 ||
    input.repositoryId.length > 128 ||
    typeof input.documentId !== "string" ||
    !uuid.test(input.documentId) ||
    typeof input.requestId !== "string" ||
    !uuid.test(input.requestId) ||
    typeof input.intentFingerprint !== "string" ||
    !sha256.test(input.intentFingerprint) ||
    typeof input.expectedVersion !== "number" ||
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 0 ||
    input.expectedVersion >= 2_147_483_647 ||
    !record(source) ||
    typeof input.expectedLineCount !== "number" ||
    !Number.isSafeInteger(input.expectedLineCount) ||
    input.expectedLineCount < 1 ||
    input.candidate === undefined
  )
    throw new ContractError(400, "Invalid Contract document command fields.", "INVALID_INPUT");
  let acknowledgement: DocumentIntakeInput["acknowledgement"];
  if (input.acknowledgement !== undefined) {
    if (
      !record(input.acknowledgement) ||
      !exactKeys(input.acknowledgement, ["reason"]) ||
      typeof input.acknowledgement.reason !== "string"
    )
      throw new ContractError(400, "Invalid discrepancy acknowledgement.", "INVALID_INPUT");
    acknowledgement = { reason: input.acknowledgement.reason };
  }
  let sourceReviewAttestation: DocumentIntakeInput["sourceReviewAttestation"];
  if (input.sourceReviewAttestation !== undefined) {
    if (input.action !== "confirm")
      throw new ContractError(
        400,
        "Original source review attestation is only valid when confirming.",
        "INVALID_INPUT",
      );
    sourceReviewAttestation = decodeSourceReviewAttestation(input.sourceReviewAttestation);
  }
  const candidate = decodePurchaseOrderCandidate(input.candidate);
  const sourcePin = decodeDocumentSource(source);
  return {
    action: input.action,
    repositoryId: input.repositoryId,
    documentId: input.documentId.toLowerCase(),
    requestId: input.requestId.toLowerCase(),
    intentFingerprint: input.intentFingerprint,
    expectedVersion: input.expectedVersion,
    expectedLineCount: input.expectedLineCount,
    source: sourcePin,
    candidate,
    ...(acknowledgement === undefined ? {} : { acknowledgement }),
    ...(sourceReviewAttestation === undefined ? {} : { sourceReviewAttestation }),
  };
}

function parseReceiptScope(value: unknown): {
  repositoryId: string;
  documentId: string;
  requestId: string;
} {
  if (
    !record(value) ||
    typeof value.repositoryId !== "string" ||
    value.repositoryId.length < 1 ||
    value.repositoryId.length > 128 ||
    typeof value.documentId !== "string" ||
    !uuid.test(value.documentId) ||
    typeof value.requestId !== "string" ||
    !uuid.test(value.requestId)
  )
    throw new ContractError(400, "Invalid Contract document receipt scope.", "INVALID_INPUT");
  return {
    repositoryId: value.repositoryId,
    documentId: value.documentId.toLowerCase(),
    requestId: value.requestId.toLowerCase(),
  };
}

function parseReadQuery(value: unknown): {
  repositoryId: string;
  documentId: string;
  revisionId?: string;
} {
  if (
    !record(value) ||
    typeof value.repositoryId !== "string" ||
    value.repositoryId.length < 1 ||
    value.repositoryId.length > 128 ||
    typeof value.documentId !== "string" ||
    !uuid.test(value.documentId) ||
    (value.revisionId !== undefined &&
      (typeof value.revisionId !== "string" || !uuid.test(value.revisionId)))
  )
    throw new ContractError(400, "Invalid Contract document read query.", "INVALID_INPUT");
  return {
    repositoryId: value.repositoryId,
    documentId: value.documentId.toLowerCase(),
    ...(value.revisionId === undefined ? {} : { revisionId: value.revisionId.toLowerCase() }),
  };
}

function documentDto(value: ContractDocumentRevision): DocumentIntakeRevisionDto {
  return {
    schemaVersion: value.schemaVersion,
    id: value.id,
    documentId: value.documentId,
    repositoryId: value.repositoryId,
    version: value.version,
    parentRevisionId: value.parentRevisionId,
    actorUserId: value.actorUserId,
    at: value.at,
    state: value.state,
    source: { ...value.source },
    expectedLineCount: value.expectedLineCount,
    candidate: structuredClone(value.candidate),
    diagnostics: [...value.diagnostics],
    acknowledgementReason: value.acknowledgementReason,
    sourceReviewAttestation:
      value.sourceReviewAttestation === null ? null : { ...value.sourceReviewAttestation },
  };
}

export function createContractDocuments(deps: {
  transactions: ContractDocumentIntakeTransactions;
  now(): number;
}): ContractDocumentIntake {
  return {
    async read(actor, rawQuery) {
      const query = parseReadQuery(rawQuery);
      try {
        const revision = await deps.transactions.read(actor, query);
        if (!revision)
          throw new ContractError(404, "Contract document revision was not found.", "NOT_FOUND");
        return documentDto(revision);
      } catch (error) {
        throw contractErrorFromUnknown(error);
      }
    },
    async receipt(actor, scope) {
      try {
        return await deps.transactions.receipt(actor, parseReceiptScope(scope));
      } catch (error) {
        throw contractErrorFromUnknown(error);
      }
    },
    async submit(actor, rawInput) {
      const input = parseDocumentInput(rawInput);
      const fingerprint = documentCommandFingerprint(input);
      try {
        return await deps.transactions.transact(
          actor,
          {
            repositoryId: input.repositoryId,
            documentId: input.documentId,
            requestId: input.requestId,
            intentFingerprint: input.intentFingerprint,
            fingerprint,
          },
          async (tx) => {
            if (!canEditContract(tx.permissions))
              throw new ContractError(403, "Contract action is not permitted.", "FORBIDDEN");
            const replay = await tx.replay();
            if (replay) {
              if (replay.intentFingerprint !== input.intentFingerprint)
                throw new ContractError(
                  409,
                  "Request identity reused with different intent.",
                  "REQUEST_ID_REUSED",
                );
              if (replay.fingerprint !== fingerprint)
                throw new ContractError(
                  409,
                  "Request identity reused with different content.",
                  "REQUEST_ID_REUSED",
                );
              return replay;
            }
            if (tx.archived)
              throw new ContractError(409, "Repository is archived.", "LIFECYCLE_CONFLICT");
            const current = await tx.load();
            const revision = createDocumentRevision(current, {
              action: input.action,
              expectedVersion: input.expectedVersion,
              expectedLineCount: input.expectedLineCount,
              candidate: input.candidate,
              source: input.source,
              ...(input.acknowledgement ? { acknowledgement: input.acknowledgement } : {}),
              ...(input.sourceReviewAttestation
                ? { sourceReviewAttestation: input.sourceReviewAttestation }
                : {}),
              id: tx.nextId(),
              documentId: input.documentId.toLowerCase(),
              repositoryId: tx.repositoryId,
              actorUserId: actor,
              at: deps.now(),
            });
            try {
              await tx.verifySource(actor, input.source);
            } catch (error) {
              throw contractErrorFromUnknown(error);
            }
            await tx.save(revision, input.expectedVersion);
            return tx.record(revision);
          },
        );
      } catch (error) {
        throw contractErrorFromUnknown(error);
      }
    },
  };
}
