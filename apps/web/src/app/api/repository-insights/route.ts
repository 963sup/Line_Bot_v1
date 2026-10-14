import { insightsRequest } from "../../../modules/repository/insights-http.server";
import { readRepositoryPulse } from "../_composition/insights.server";
import { requestLineIdentity } from "../_composition/request-identity.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return insightsRequest(request, readRepositoryPulse, requestLineIdentity);
}
