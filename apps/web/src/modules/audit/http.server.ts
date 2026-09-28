import type { createAuditQuery } from "@line_bot_v1/audit/application";
import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { captureHandledServerError } from "../../shared/observability/server-error";
import { jsonResponse } from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";

export async function auditRequest(
  request: Request,
  identity: () => Promise<VerifiedLineActor>,
  query: ReturnType<typeof createAuditQuery>,
) {
  try {
    const actor = await identity();
    const params = new URL(request.url).searchParams;
    const result = await query.list(actor, {
      scopeKind: params.get("scopeKind") ?? "",
      scopeId: params.get("scopeId") ?? "",
      before: params.get("before") ?? undefined,
      limit: params.has("limit") ? Number(params.get("limit")) : undefined,
    });
    return jsonResponse(result, result.ok ? 200 : result.error === "forbidden" ? 403 : 400);
  } catch (error) {
    const status = error instanceof RequestIdentityError ? error.status : 503;
    captureHandledServerError(error, { service: "audit-api", operation: "read", status });
    return jsonResponse(
      { error: status === 401 ? "unauthorized" : "unavailable", retryable: status !== 401 },
      status,
    );
  }
}
