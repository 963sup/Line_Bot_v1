import { projectWbsMetricsRequest } from "../../../../modules/project/project-wbs-metrics-http.server";
import { readProjectWbsMetrics } from "../../_composition/project-wbs-metrics.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return projectWbsMetricsRequest(request, {
    identity: requestLineIdentity,
    read: readProjectWbsMetrics,
  });
}
