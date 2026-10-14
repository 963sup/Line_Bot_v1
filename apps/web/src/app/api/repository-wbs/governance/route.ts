import { wbsGovernanceRequest } from "../../../../modules/repository/wbs-governance-http.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";
import { wbsGovernance } from "../../_composition/wbs.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return wbsGovernanceRequest(request, wbsGovernance, requestLineIdentity);
}
export function POST(request: Request) {
  return wbsGovernanceRequest(request, wbsGovernance, requestLineIdentity);
}
