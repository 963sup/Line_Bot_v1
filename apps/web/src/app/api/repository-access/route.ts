import { createRepositoryAccess } from "@line_bot_v1/repository/application/access";
import { PostgresRepositoryAccessStore } from "@line_bot_v1/repository/postgres/access-management";
import {
  repositoryAccessCommandRequest,
  repositoryAccessViewRequest,
} from "../../../modules/repository/access-http.server";
import { activeLineUser } from "../_composition/account.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

let store: PostgresRepositoryAccessStore | undefined;

const repositoryAccess = createRepositoryAccess({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryAccessStore()),
  now: Date.now,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return repositoryAccessViewRequest(request, repositoryAccess, requestLineIdentity);
}

export function POST(request: Request) {
  return repositoryAccessCommandRequest(request, repositoryAccess, requestLineIdentity);
}
