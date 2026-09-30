import { LINE_PROVIDER_NAMESPACE } from "@line_bot_v1/line-channel/provider";
import { captureHandledServerError } from "../../../shared/observability/server-error";
import { jsonResponse } from "../../../shared/server/http";
import { RequestIdentityError } from "../../../shared/server/request-identity-error";
import { auditQuery } from "../_composition/audit.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = {
      provider: LINE_PROVIDER_NAMESPACE,
      subject: await requestLineIdentity(request),
    };
    const params = new URL(request.url).searchParams;
    const result = await auditQuery.list(actor, {
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
