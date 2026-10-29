import { createRepositoryAddress } from "@line_bot_v1/repository/application/address";
import { PostgresRepositoryAddressStore } from "@line_bot_v1/repository/postgres/address";
import {
  repositoryAddressCommandRequest,
  repositoryAddressViewRequest,
} from "../../../modules/repository/address-http.server";
import { activeLineUser } from "../_composition/account.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

let store: PostgresRepositoryAddressStore | undefined;

const repositoryAddress = createRepositoryAddress({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryAddressStore()),
  now: Date.now,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return repositoryAddressViewRequest(request, repositoryAddress, requestLineIdentity);
}

export function POST(request: Request) {
  return repositoryAddressCommandRequest(request, repositoryAddress, requestLineIdentity);
}
