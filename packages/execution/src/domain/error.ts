export type ExecutionErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAVAILABLE";

export class ExecutionError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: ExecutionErrorCode,
  ) {
    super(message);
  }
}

export function executionErrorFromUnknown(error: unknown): ExecutionError {
  if (error instanceof ExecutionError) return error;
  if (error && typeof error === "object") {
    const status = Reflect.get(error, "status");
    if (status === 400)
      return new ExecutionError(400, "Execution input is invalid.", "INVALID_INPUT");
    if (status === 403)
      return new ExecutionError(403, "Execution operation is not authorized.", "FORBIDDEN");
    if (status === 404)
      return new ExecutionError(404, "Execution source was not found.", "NOT_FOUND");
    if (status === 409)
      return new ExecutionError(
        409,
        "Execution operation conflicts with current state.",
        "CONFLICT",
      );
  }
  return new ExecutionError(503, "Execution operation is unavailable.", "UNAVAILABLE");
}
