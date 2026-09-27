import { repositoryFailure } from "../../../../modules/repository/http.server";
import { jsonResponse } from "../../../../shared/server/http";
import { repositoryStars } from "../../_composition/repository-stars.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return jsonResponse({
      items: await repositoryStars.starred(await requestLineIdentity(request)),
    });
  } catch (error) {
    return repositoryFailure(error);
  }
}
