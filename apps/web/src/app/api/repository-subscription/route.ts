import {
  repositorySubscriptionCommandRequest,
  repositorySubscriptionViewRequest,
} from "../../../modules/repository/subscription-http.server";
import { repositorySubscription } from "../_composition/repository-subscription.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return repositorySubscriptionViewRequest(request, repositorySubscription, requestLineIdentity);
}

export function POST(request: Request) {
  return repositorySubscriptionCommandRequest(request, repositorySubscription, requestLineIdentity);
}
