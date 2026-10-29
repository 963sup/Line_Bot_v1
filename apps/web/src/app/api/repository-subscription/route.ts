import { createRepositorySubscription } from "@line_bot_v1/repository/application/subscription";
import { PostgresRepositorySubscriptionStore } from "@line_bot_v1/repository/postgres/subscription";
import {
  repositorySubscriptionCommandRequest,
  repositorySubscriptionViewRequest,
} from "../../../modules/repository/subscription-http.server";
import { activeLineUser } from "../_composition/account.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

let store: PostgresRepositorySubscriptionStore | undefined;

const repositorySubscription = createRepositorySubscription({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositorySubscriptionStore()),
  now: Date.now,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return repositorySubscriptionViewRequest(request, repositorySubscription, requestLineIdentity);
}

export function POST(request: Request) {
  return repositorySubscriptionCommandRequest(request, repositorySubscription, requestLineIdentity);
}
