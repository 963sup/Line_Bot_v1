import { workplaceRequest } from "../../../modules/attendance/workplaces.server";
import { workplaces } from "../_composition/attendance.server";
import { requestLineIdentity } from "../_composition/request-identity.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const dependencies = (request: Request) => ({
  workplaces,
  requestIdentity: () => requestLineIdentity(request),
});
export const GET = (request: Request) => workplaceRequest(request, dependencies(request));
export const POST = (request: Request) => workplaceRequest(request, dependencies(request));
