export type CommercialIntakeContext = Readonly<{ actorUserId: string; traceId: string }>;
export type CommercialIntakeCommand = Readonly<{
  commandId: string;
  repositoryId: string;
  source: { fileId: string; fileRevisionId: string; sha256: string };
  target: { documentId: string; draftCommandId: string; expectedDocumentVersion: number };
}>;
export type CommercialDraftReceipt = Readonly<{
  commandId: string;
  documentId: string;
  revisionId: string;
  documentVersion: number;
  operation: "CREATE_DRAFT";
}>;
export interface CommercialIntakeTarget {
  assertReady(actorUserId: string, repositoryId: string): Promise<void>;
  createDraftFromExtraction(
    ctx: CommercialIntakeContext,
    command: {
      commandId: string;
      repositoryId: string;
      documentId: string;
      expectedVersion: number;
      extractionResultId: string;
    },
  ): Promise<CommercialDraftReceipt>;
  receipt(
    actor: string,
    query: { repositoryId: string; commandId: string },
    expected?: { documentId: string; expectedVersion: number; extractionResultId: string },
  ): Promise<CommercialDraftReceipt | null>;
}
export type CommercialObservationPayload = Readonly<{
  observations: readonly Readonly<{
    pageNumber: number;
    rawLabel: string | null;
    rawValue: string | null;
  }>[];
  semanticHints: readonly Readonly<{
    observationIndex: number;
    target: string;
    rowKey: string | null;
  }>[];
  wbsDraft?: Readonly<{
    workRows: readonly Readonly<{
      rowKey: string;
      eligible: boolean;
      blockers: readonly string[];
    }>[];
  }>;
}>;
export type CommercialExtractionResult = Readonly<{
  extractionResultId: string;
  repositoryId: string;
  source: CommercialIntakeCommand["source"];
  pageCount: number;
  observations: readonly (CommercialObservationPayload["observations"][number] & {
    observationId: string;
  })[];
  semanticHints: CommercialObservationPayload["semanticHints"];
  wbsDraft: NonNullable<CommercialObservationPayload["wbsDraft"]>;
}>;
export type CommercialIntakeStatus = Readonly<{
  state: "WAITING" | "ANALYZING" | "RESULT_READY" | "DRAFT_SAVED" | "FAILED" | "OUTCOME_UNKNOWN";
  commandId: string;
  extractionResultId: string | null;
  documentId: string;
  receipt: CommercialDraftReceipt | null;
  failure: { code: string; stage: string } | null;
}>;

/** Validate the owner status identity before a caller may treat it as the requested command. */
export function parseCommercialIntakeStatusIdentity(
  value: unknown,
  expected: Pick<CommercialIntakeCommand, "commandId"> & { documentId: string },
): CommercialIntakeStatus["state"] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("商務文件回應不符合原命令。");
  }
  const state = Reflect.get(value, "state");
  if (
    (state !== "WAITING" &&
      state !== "ANALYZING" &&
      state !== "RESULT_READY" &&
      state !== "DRAFT_SAVED" &&
      state !== "FAILED" &&
      state !== "OUTCOME_UNKNOWN") ||
    Reflect.get(value, "commandId") !== expected.commandId ||
    Reflect.get(value, "documentId") !== expected.documentId
  ) {
    throw new Error("商務文件回應不符合原命令。");
  }
  return state;
}
export class CommercialIntakeError extends Error {
  override readonly name = "CommercialIntakeError";
  constructor(
    readonly code: string,
    readonly status: number,
    readonly stage: string,
    options?: ErrorOptions,
  ) {
    super(options?.cause instanceof Error ? options.cause.message : code, options);
  }
}
export interface CommercialIntake {
  start(
    ctx: CommercialIntakeContext,
    command: CommercialIntakeCommand,
  ): Promise<CommercialIntakeStatus>;
  status(
    ctx: CommercialIntakeContext,
    query: { repositoryId: string; commandId: string },
  ): Promise<CommercialIntakeStatus>;
  resume(
    ctx: CommercialIntakeContext,
    query: { repositoryId: string; commandId: string },
  ): Promise<CommercialIntakeStatus>;
  readResult(
    actor: string,
    query: { repositoryId: string; extractionResultId: string },
  ): Promise<CommercialExtractionResult>;
}
