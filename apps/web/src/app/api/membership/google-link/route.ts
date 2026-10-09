import { createGoogleLinkRequest } from "../../../../modules/account/google-link-api.server";
import { googleLink, verifyGoogle } from "../../_composition/account.server";
import { limitRequest, requestLineIdentity } from "../../_composition/request-identity.server";

export const { GET, POST } = createGoogleLinkRequest(googleLink, {
  requestIdentity: requestLineIdentity,
  limitRequest: (token) => limitRequest("member-api", token),
  verifyGoogle,
});
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
