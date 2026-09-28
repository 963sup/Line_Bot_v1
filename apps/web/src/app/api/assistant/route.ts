import { assistantRequest } from "../../../modules/assistant/api.server";
import { assistantSurface } from "../_composition/assistant.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = (request: Request) =>
  assistantRequest(request, assistantSurface, () => requestLineIdentity(request));
