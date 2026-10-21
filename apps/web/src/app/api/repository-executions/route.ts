import { executionsRequest } from "../../../modules/execution/executions-http.server";
import { executions } from "../_composition/executions.server";
import { requestLineIdentity } from "../_composition/request-identity.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return executionsRequest(request, executions, requestLineIdentity);
}
export function POST(request: Request) {
  return executionsRequest(request, executions, requestLineIdentity);
}
