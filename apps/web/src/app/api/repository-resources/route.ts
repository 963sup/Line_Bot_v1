import { resourcesRequest } from "../../../modules/resources/resources-http.server";
import { requestLineIdentity } from "../_composition/request-identity.server";
import { resources } from "../_composition/resources.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return resourcesRequest(request, resources, requestLineIdentity);
}
export function POST(request: Request) {
  return resourcesRequest(request, resources, requestLineIdentity);
}
