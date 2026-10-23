import { filesRequest } from "../../../modules/file/files-http.server";
import { files } from "../_composition/files.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return filesRequest(request, files, requestLineIdentity);
}
export function POST(request: Request) {
  return filesRequest(request, files, requestLineIdentity);
}
