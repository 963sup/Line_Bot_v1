import { createUserRequest } from "../../../modules/account/api.server";
import {
  activeLineUser,
  checkIn,
  getUser,
  pauseUser,
  readClaim,
  updateLogin,
} from "../_composition/account.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const { GET, POST } = createUserRequest({
  activeLineUser,
  checkIn,
  pauseUser,
  readClaim,
  updateLogin,
  getUser,
  requestIdentity: requestLineIdentity,
});
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
