import type {
  CommercialExtractionResult,
  CommercialIntakeCommand,
} from "../output/commercial-intake.js";
export type ExtractionProfile = Readonly<{
  key: string;
  model: string;
  modelFingerprint: string;
  normalizerFingerprint: string;
  schemaFingerprint: string;
  promptFingerprint: string;
  configurationFingerprint: string;
  normalizerVersion: string;
  maxInputBytes: number;
  maxPdfPages: number;
  maxOutputTokens: number;
  timeoutMs: number;
  inputTokenCountTimeoutMs: number;
  inputTokenBudget: number;
  estimatorVersion: string;
}>;
export type CommercialJob = Readonly<{
  id: string;
  actor: string;
  command: CommercialIntakeCommand;
  intent: string;
  profile: ExtractionProfile;
  pageCount: number;
  byteLength: number;
  inputTokenCount: number;
  token: string;
  version: number;
  leaseUntil: number;
  state: "RESERVED" | "DISPATCHED" | "READY" | "FAILED" | "OUTCOME_UNKNOWN";
  dispatchCount: number;
  extractionResultId: string | null;
  failure: { code: string; stage: string } | null;
}>;
export interface CommercialIntakeStore {
  qualify(actor: string, command: CommercialIntakeCommand): Promise<void>;
  find(actor: string, repositoryId: string, commandId: string): Promise<CommercialJob | null>;
  reserve(
    actor: string,
    command: CommercialIntakeCommand,
    intent: string,
    profile: ExtractionProfile,
    manifest: { pageCount: number; byteLength: number; inputTokenCount: number },
  ): Promise<{ job: CommercialJob; owned: boolean }>;
  dispatch(job: CommercialJob): Promise<boolean>;
  complete(job: CommercialJob, result: CommercialExtractionResult): Promise<void>;
  fail(job: CommercialJob, code: string, stage: string, unknown: boolean): Promise<void>;
  result(
    actor: string,
    repositoryId: string,
    resultId: string,
  ): Promise<CommercialExtractionResult>;
}
