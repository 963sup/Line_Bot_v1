export type IntelligenceErrorCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "UNSUPPORTED_MEDIA"
  | "INPUT_LIMIT"
  | "EXTRACTION_UNAVAILABLE";

export class IntelligenceError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: IntelligenceErrorCode,
  ) {
    super(message);
  }
}
