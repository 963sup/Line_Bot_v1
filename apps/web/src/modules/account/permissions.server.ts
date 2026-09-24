import { UserError } from "@line-work/account/domain/user";
import type { createPermissions } from "@line-work/identity-access/application/permissions";
import { PermissionError } from "@line-work/identity-access/domain/permission";
import { captureHandledServerError } from "../../shared/observability/server-error";
import { jsonResponse } from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";
import { readJsonBody } from "./http.server";

function permissionApiError(error: unknown) {
  const known =
    error instanceof PermissionError ||
    error instanceof UserError ||
    error instanceof RequestIdentityError;
  const status = known ? error.status : 503;
  captureHandledServerError(error, {
    service: "permissions-api",
    operation: "request",
    status,
  });
  const code =
    status === 401
      ? "session_expired"
      : status === 403
        ? "membership_denied"
        : status === 409
          ? "operation_conflict"
          : status === 429
            ? "rate_limited"
            : status >= 500
              ? "service_unavailable"
              : "invalid_request";
  return jsonResponse(
    {
      error: known ? error.message : "權限服務暫不可用，請稍後重試。",
      code,
      retryable: status === 429 || status >= 500,
    },
    status,
  );
}

export async function permissionRequest(
  request: Request,
  service: ReturnType<typeof createPermissions>,
  requestIdentity: () => Promise<string>,
) {
  try {
    const subject = await requestIdentity();
    return jsonResponse(
      request.method === "POST"
        ? await service.change(subject, await readJsonBody(request, 4096))
        : await service.read(subject, new URL(request.url).searchParams.get("target") ?? ""),
    );
  } catch (error) {
    return permissionApiError(error);
  }
}
