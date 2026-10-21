import { contractsRequest } from "../../../modules/contract/contracts-http.server";
import { contracts } from "../_composition/contracts.server";
import { requestLineIdentity } from "../_composition/request-identity.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return contractsRequest(request, contracts, requestLineIdentity);
}
export function POST(request: Request) {
  return contractsRequest(request, contracts, requestLineIdentity);
}
