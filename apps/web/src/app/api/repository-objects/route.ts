import { objectRequest } from "../../../modules/object/object-http.server";
import { objects } from "../_composition/objects.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return objectRequest(request, "objects", objects, requestLineIdentity);
}
export function POST(request: Request) {
  return objectRequest(request, "objects", objects, requestLineIdentity);
}
