import {
  repositoryAccessCommandRequest,
  repositoryAccessViewRequest,
} from "../../../modules/repository/access-http.server";
import { repositoryAccess } from "../_composition/repository-access.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return repositoryAccessViewRequest(request, repositoryAccess, requestLineIdentity);
}

export function POST(request: Request) {
  return repositoryAccessCommandRequest(request, repositoryAccess, requestLineIdentity);
}
