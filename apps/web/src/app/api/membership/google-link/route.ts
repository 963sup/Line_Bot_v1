import { createGoogleLinkRequest } from "../../../../modules/account/google-link-api.server";
import { googleLink } from "../../_composition/account.server";
import { limitRequest, requestLineIdentity } from "../../_composition/request-identity.server";

export const { GET, POST } = createGoogleLinkRequest(googleLink, {
  requestIdentity: requestLineIdentity,
  limitRequest: (token) => limitRequest("member-api", token),
});
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
