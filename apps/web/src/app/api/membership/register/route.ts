import { apiError, readJsonBody } from "../../../../modules/account/http.server";
import { jsonResponse } from "../../../../shared/server/http";
import { registerUser } from "../../_composition/account.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const subject = await requestLineIdentity(request);
    return jsonResponse({ member: await registerUser(subject, body.login) });
  } catch (error) {
    return apiError(error);
  }
}
