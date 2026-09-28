import { partnerRequest } from "../../../modules/partners/http.server";
import { partners } from "../_composition/partners.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) =>
  partnerRequest(request, partners, () => requestLineIdentity(request));
export const POST = (request: Request) =>
  partnerRequest(request, partners, () => requestLineIdentity(request));
