import {
  repositoryAddressCommandRequest,
  repositoryAddressViewRequest,
} from "../../../modules/repository/address-http.server";
import { repositoryAddress } from "../_composition/repository-address.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return repositoryAddressViewRequest(request, repositoryAddress, requestLineIdentity);
}

export function POST(request: Request) {
  return repositoryAddressCommandRequest(request, repositoryAddress, requestLineIdentity);
}
