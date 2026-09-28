import { LINE_PROVIDER_NAMESPACE } from "@line_bot_v1/line-channel/provider";
import { auditRequest } from "../../../modules/audit/http.server";
import { auditQuery } from "../_composition/audit.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return auditRequest(
    request,
    async () => ({
      provider: LINE_PROVIDER_NAMESPACE,
      subject: await requestLineIdentity(request),
    }),
    auditQuery,
  );
}
