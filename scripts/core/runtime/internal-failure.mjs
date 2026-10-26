import { LineIdentityError } from "@line_bot_v1/line/identity";
import { InternalInputError, InternalQualificationError } from "./internal-input.mjs";

/** Project trusted error types without exposing messages, causes or provider payloads. */
export function classifyInternalFailure(error, OwnerErrorClass, mutationStarted) {
  if (error instanceof OwnerErrorClass && !(mutationStarted && error.code === "UNAVAILABLE"))
    return { status: error.status, code: error.code };
  if (mutationStarted) return { status: 503, code: "UNKNOWN_RESULT" };
  if (error instanceof InternalInputError) return { status: 400, code: "INVALID_INPUT" };
  if (error instanceof LineIdentityError) return { status: 401, code: "UNAUTHENTICATED" };
  if (error instanceof InternalQualificationError) return { status: 403, code: "FORBIDDEN" };
  return { status: 503, code: "UNAVAILABLE" };
}
