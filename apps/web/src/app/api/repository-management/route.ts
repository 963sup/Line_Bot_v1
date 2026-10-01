import {
  repositoryManagementCommandRequest,
  repositoryManagementViewRequest,
} from "../../../modules/repository/management-http.server";
import { repositoryManagement } from "../_composition/repository-management.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return repositoryManagementViewRequest(request, repositoryManagement, requestLineIdentity);
}

export function POST(request: Request) {
  return repositoryManagementCommandRequest(request, repositoryManagement, requestLineIdentity);
}
