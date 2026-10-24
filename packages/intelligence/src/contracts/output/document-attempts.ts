import type { FileSourceReference } from "@line_bot_v1/file/contracts/output/references";

export type DocumentAttemptInput = Readonly<{
  requestId: string;
  repositoryId: string;
  source: FileSourceReference;
  intentFingerprint: string;
}>;

export type DocumentAttempt = Readonly<{
  id: string;
  fresh: boolean;
}>;

export type DocumentAttemptErrorCode =
  | "INVALID_ATTEMPT"
  | "REQUEST_ID_REUSED"
  | "ATTEMPT_FENCED"
  | "COMPLETION_CONFLICT";

export class DocumentAttemptError extends Error {
  constructor(
    readonly status: 400 | 409,
    readonly code: DocumentAttemptErrorCode,
  ) {
    super(code);
    this.name = "DocumentAttemptError";
  }
}

/** Technical recovery record only; Contract remains the owner of candidate and formal facts. */
export interface DocumentAttempts {
  reserve(actor: string, input: DocumentAttemptInput): Promise<DocumentAttempt>;
  complete(
    actor: string,
    input: DocumentAttemptInput & Readonly<{ id: string }>,
    target: Readonly<{ documentId: string; revisionId: string }>,
  ): Promise<void>;
  unknown(actor: string, input: DocumentAttemptInput & Readonly<{ id: string }>): Promise<void>;
}
