export type ObjectErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "LIFECYCLE_CONFLICT"
  | "REQUEST_ID_REUSED"
  | "UNAVAILABLE"
  | "TYPE_NAME_CONFLICT"
  | "RELATIONSHIP_DUPLICATE"
  | "OBJECT_ARCHIVED";

export class ObjectError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: ObjectErrorCode,
  ) {
    super(message);
  }
}
