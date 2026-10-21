import { contentRequest } from "../../../modules/content/content-http.server";
import { contentPlans } from "../_composition/content-plans.server";
import { requestLineIdentity } from "../_composition/request-identity.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return contentRequest(request, contentPlans, requestLineIdentity);
}
export function POST(request: Request) {
  return contentRequest(request, contentPlans, requestLineIdentity);
}
