import { apiError, readJsonBody } from "../../../../modules/account/http.server";
import { jsonResponse } from "../../../../shared/server/http";
import { profileStatuses } from "../../_composition/account-status.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return jsonResponse({ status: await profileStatuses.get(await requestLineIdentity(request)) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    return jsonResponse({
      status: await profileStatuses.change(await requestLineIdentity(request), body),
    });
  } catch (error) {
    return apiError(error);
  }
}
