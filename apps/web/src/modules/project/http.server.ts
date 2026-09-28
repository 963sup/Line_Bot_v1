import { UserError } from "@line_bot_v1/account/domain/user";
import { captureHandledServerError } from "../../shared/observability/server-error";
import { jsonResponse } from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";

export function projectFailure(error: unknown) {
  const known = error instanceof UserError || error instanceof RequestIdentityError;
  const status = known ? ((error as { status?: number }).status ?? 400) : 503;
  captureHandledServerError(error, {
    service: "project-api",
    operation: "read",
    status,
  });
  return jsonResponse(
    {
      error: known ? (error as Error).message : "Project 列表暫不可用，請稍後重試。",
      retryable: status >= 500 || status === 429,
    },
    status,
  );
}
