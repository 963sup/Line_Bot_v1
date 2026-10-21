export type ResourceErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "LIFECYCLE_CONFLICT"
  | "REQUEST_ID_REUSED"
  | "SOURCE_INVALID"
  | "UNAVAILABLE";

export class ResourceError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: ResourceErrorCode,
  ) {
    super(message);
  }
}

export function resourceErrorFromUnknown(error: unknown): ResourceError {
  if (error instanceof ResourceError) return error;
  if (error && typeof error === "object" && "status" in error) {
    const status = Reflect.get(error, "status");
    if (status === 403)
      return new ResourceError(403, "Resource operation is not authorized.", "FORBIDDEN");
    if (status === 404) return new ResourceError(404, "Resource was not found.", "NOT_FOUND");
    if (status === 400 || status === 409)
      return new ResourceError(409, "Resource source is not eligible.", "SOURCE_INVALID");
  }
  return new ResourceError(503, "Resource operation is unavailable.", "UNAVAILABLE");
}
