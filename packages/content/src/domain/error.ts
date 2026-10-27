export type ContentErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "LIFECYCLE_CONFLICT"
  | "REQUEST_ID_REUSED"
  | "SOURCE_INVALID"
  | "UNAVAILABLE";

export class ContentError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: ContentErrorCode,
  ) {
    super(message);
  }
}

export function contentErrorFromUnknown(error: unknown): ContentError {
  if (error instanceof ContentError) return error;
  if (error && typeof error === "object" && "status" in error) {
    const status = Reflect.get(error, "status");
    if (status === 403)
      return new ContentError(403, "Content operation is not authorized.", "FORBIDDEN");
    if (status === 404) return new ContentError(404, "Content source was not found.", "NOT_FOUND");
    if (status === 400 || status === 409)
      return new ContentError(409, "Content source is not eligible.", "SOURCE_INVALID");
  }
  throw error;
}
