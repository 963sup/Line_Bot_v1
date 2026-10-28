export type ContractErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "LIFECYCLE_CONFLICT"
  | "REQUEST_ID_REUSED"
  | "SOURCE_INVALID"
  | "UNAVAILABLE";

export class ContractError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: ContractErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function contractErrorFromUnknown(error: unknown): ContractError {
  if (error instanceof ContractError) return error;
  if (error && typeof error === "object" && "status" in error) {
    const status = Reflect.get(error, "status");
    if (status === 403)
      return new ContractError(403, "Contract operation is not authorized.", "FORBIDDEN");
    if (status === 404)
      return new ContractError(404, "Contract source was not found.", "NOT_FOUND");
    if (status === 400 || status === 409)
      return new ContractError(409, "Contract source is not eligible.", "SOURCE_INVALID");
  }
  throw error;
}
