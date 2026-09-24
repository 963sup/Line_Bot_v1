import { LINE_PROVIDER_NAMESPACE } from "@line-work/line-channel/provider";
import { enterpriseRequest } from "../../../modules/enterprise/http.server";
import { enterpriseRoles, enterpriseService } from "../_composition/enterprise.server";
import { requestLineIdentity } from "../_composition/request-identity.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return enterpriseRequest(
    request,
    () => LINE_PROVIDER_NAMESPACE,
    () => requestLineIdentity(request),
    (actor, body) => enterpriseService().execute(actor, body),
    (actor, selector) =>
      selector.slug
        ? enterpriseService().detailBySlug(actor, selector.slug)
        : selector.id
          ? enterpriseService().detail(actor, selector.id)
          : enterpriseService().list(actor, {}),
  );
}
export async function POST(request: Request) {
  return enterpriseRequest(
    request,
    () => LINE_PROVIDER_NAMESPACE,
    () => requestLineIdentity(request),
    (actor, body) =>
      body && typeof body === "object" && "scopeKind" in body
        ? enterpriseRoles().execute(actor, body)
        : enterpriseService().execute(actor, body),
    (actor, selector) =>
      selector.slug
        ? enterpriseService().detailBySlug(actor, selector.slug)
        : selector.id
          ? enterpriseService().detail(actor, selector.id)
          : enterpriseService().list(actor, {}),
  );
}
