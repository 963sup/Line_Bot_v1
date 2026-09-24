import { apiError, readJsonBody } from "../../../modules/account/http.server";
import { jsonResponse } from "../../../shared/server/http";
import { profiles } from "../_composition/account.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return jsonResponse({ profile: await profiles.get(await requestLineIdentity(request)) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request, 4096);
    return jsonResponse({
      profile: await profiles.update(await requestLineIdentity(request), body),
    });
  } catch (error) {
    return apiError(error);
  }
}
