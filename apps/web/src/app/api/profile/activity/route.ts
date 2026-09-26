import { apiError } from "../../../../modules/account/http.server";
import { jsonResponse } from "../../../../shared/server/http";
import { profileActivity } from "../../_composition/account.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return jsonResponse({
      activity: await profileActivity.read(await requestLineIdentity(request)),
    });
  } catch (error) {
    return apiError(error);
  }
}
