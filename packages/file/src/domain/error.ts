export type FileErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "LIFECYCLE_CONFLICT"
  | "REQUEST_ID_REUSED"
  | "SOURCE_INVALID"
  | "UNSUPPORTED_MEDIA"
  | "EXTRACTION_UNAVAILABLE"
  | "UNAVAILABLE";

export class FileError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: FileErrorCode,
  ) {
    super(message);
  }
}

export function fileErrorFromUnknown(error: unknown): FileError {
  if (error instanceof FileError) return error;
  if (error && typeof error === "object") {
    const status = Reflect.get(error, "status");
    if (status === 403) return new FileError(403, "File access denied.", "FORBIDDEN");
    if (status === 404) return new FileError(404, "File evidence not found.", "NOT_FOUND");
  }
  throw error;
}
