import { createRepositoryManagement } from "@line_bot_v1/repository/application/management";
import { PostgresRepositoryManagementStore } from "@line_bot_v1/repository/postgres/management";
import {
  repositoryManagementCommandRequest,
  repositoryManagementViewRequest,
} from "../../../modules/repository/management-http.server";
import { activeLineUser } from "../_composition/account.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

let store: PostgresRepositoryManagementStore | undefined;

const repositoryManagement = createRepositoryManagement({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryManagementStore()),
  now: Date.now,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return repositoryManagementViewRequest(request, repositoryManagement, requestLineIdentity);
}

export function POST(request: Request) {
  return repositoryManagementCommandRequest(request, repositoryManagement, requestLineIdentity);
}
