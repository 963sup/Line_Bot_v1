import type {
  FileSourceReader,
  FileSourceReference,
} from "@line_bot_v1/file/contracts/output/references";

/** Request-local technical progress only; never includes source bytes or extracted content. */
export type IntakeStage =
  | "attempt.reserve"
  | "target.receipt"
  | "file.read"
  | "intelligence.extract"
  | "target.submit"
  | "attempt.complete";

export class IntakeError extends Error {
  override readonly name = "IntakeError";

  constructor(
    readonly code:
      | "SOURCE_MISMATCH"
      | "SOURCE_TOO_LARGE"
      | "REPLAY_CONFLICT"
      | "INVALID_INPUT"
      | "UNKNOWN_RESULT",
    readonly status: 409 | 413 | 422 | 503,
    options?: ErrorOptions,
  ) {
    super(code, options);
  }
}

export type IntakeCommand = Readonly<{
  action: "save";
  repositoryId: string;
  documentId: string;
  requestId: string;
  expectedVersion: number;
  source: FileSourceReference;
}>;

export type IntakeSchema = Readonly<{
  id: string;
  version: number;
  schema: Readonly<Record<string, unknown>>;
}>;

export type IntakeReceipt = Readonly<{
  repositoryId: string;
  documentId: string;
  requestId: string;
  revisionId: string;
  version: number;
  source: FileSourceReference;
  intentFingerprint: string;
}>;

export interface IntakeTarget<Receipt extends IntakeReceipt> {
  receipt(
    actor: string,
    scope: Readonly<{ repositoryId: string; documentId: string; requestId: string }>,
  ): Promise<Receipt | null>;
  submit(actor: string, input: unknown): Promise<Receipt>;
}

export interface DocumentExtractor {
  readonly id: string;
  readonly version: string;
  extract(
    input: Readonly<{
      bytes: Uint8Array;
      mediaType: string;
      schema: IntakeSchema;
    }>,
  ): Promise<unknown>;
}

export type DocumentIntakeSource = FileSourceReader;
