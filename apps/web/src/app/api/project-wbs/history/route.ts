import { projectWbsRequest } from "../../../../modules/project/project-wbs-http.server";
import { projectWbs } from "../../_composition/project-wbs.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return projectWbsRequest(request, projectWbs, requestLineIdentity, true);
}
