import { wbsRequest } from "../../../../modules/repository/wbs-http.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";
import { wbs } from "../../_composition/wbs.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return wbsRequest(request, wbs, requestLineIdentity, true);
}
