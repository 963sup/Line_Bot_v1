import { wikiRequest } from "../../../modules/repository/wiki-http.server";
import { requestLineIdentity } from "../_composition/request-identity.server";
import { wiki } from "../_composition/wiki.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return wikiRequest(request, wiki, requestLineIdentity);
}
export function POST(request: Request) {
  return wikiRequest(request, wiki, requestLineIdentity);
}
