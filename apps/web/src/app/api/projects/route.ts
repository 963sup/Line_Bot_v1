import { projectFailure } from "../../../modules/project/http.server";
import { jsonResponse } from "../../../shared/server/http";
import { projectCollection } from "../_composition/project-collection.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return jsonResponse(await projectCollection.accessible(await requestLineIdentity(request)));
  } catch (error) {
    return projectFailure(error);
  }
}
