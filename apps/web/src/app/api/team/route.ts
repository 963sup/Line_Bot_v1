import { LINE_PROVIDER_NAMESPACE } from "@line_bot_v1/line/provider";
import { createTeamCollaboration } from "@line_bot_v1/team/application/collaboration";
import { PostgresTeamRepository } from "@line_bot_v1/team/postgres";
import { teamApiError, teamBody, teamQuery } from "../../../modules/team/http.server";
import { jsonResponse } from "../../../shared/server/http";
import { requestLineIdentity } from "../_composition/request-identity.server";

const teamCollaboration = createTeamCollaboration(
  () => new PostgresTeamRepository(),
  () => Date.now(),
);
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const subject = await requestLineIdentity(request),
      query = teamQuery(request);
    const actor = { provider: LINE_PROVIDER_NAMESPACE, subject };
    return jsonResponse(
      query.kind === "locator"
        ? await teamCollaboration.viewByLocator(actor, query.organizationLogin, query.teamSlug)
        : await teamCollaboration.view(actor, query.organizationAccountId, query.teamId),
    );
  } catch (error) {
    return teamApiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const body = await teamBody(request),
      subject = await requestLineIdentity(request);
    return jsonResponse(
      await teamCollaboration.execute({ provider: LINE_PROVIDER_NAMESPACE, subject }, body),
    );
  } catch (error) {
    return teamApiError(error);
  }
}
