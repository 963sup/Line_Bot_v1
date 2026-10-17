import { projectWbsGovernanceRequest } from "../../../../modules/project/project-wbs-governance-http.server";
import { projectWbsGovernance } from "../../_composition/project-wbs.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return projectWbsGovernanceRequest(request, projectWbsGovernance, requestLineIdentity);
}

export function POST(request: Request) {
  return projectWbsGovernanceRequest(request, projectWbsGovernance, requestLineIdentity);
}
