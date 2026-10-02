import { LINE_PROVIDER_NAMESPACE } from "@line_bot_v1/line/provider";
import { organizationRequest } from "../../../modules/organization/http.server";
import { normalizeOrganizationWireCommand } from "../../../modules/organization/wire-command";
import { organizationService } from "../_composition/organization.server";
import { requestLineIdentity } from "../_composition/request-identity.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return organizationRequest(
    request,
    () => LINE_PROVIDER_NAMESPACE,
    () => requestLineIdentity(request),
    (actor, body) => organizationService().execute(actor, body),
    (actor, id) =>
      id ? organizationService().detail(actor, id) : organizationService().list(actor, {}),
  );
}
export async function POST(request: Request) {
  return organizationRequest(
    request,
    () => LINE_PROVIDER_NAMESPACE,
    () => requestLineIdentity(request),
    (actor, body) => organizationService().execute(actor, normalizeOrganizationWireCommand(body)),
    (actor, id) =>
      id ? organizationService().detail(actor, id) : organizationService().list(actor, {}),
  );
}
