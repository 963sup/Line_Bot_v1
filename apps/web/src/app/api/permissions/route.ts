import { permissionRequest } from "../../../modules/account/permissions.server";
import { permissions } from "../_composition/permissions.server";
import { requestLineIdentity } from "../_composition/request-identity.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) =>
  permissionRequest(request, permissions, () => requestLineIdentity(request));
export const POST = (request: Request) =>
  permissionRequest(request, permissions, () => requestLineIdentity(request));
