import { isRecord } from "@line_bot_v1/platform/validation";
import type {
  RepositorySubscriptionSnapshot,
  RepositorySubscriptionState,
} from "./input/repository-subscription.js";

export function isSubscriptionState(value: unknown): value is RepositorySubscriptionState {
  return value === "SUBSCRIBED" || value === "UNSUBSCRIBED" || value === "IGNORED";
}

export function isSubscriptionSnapshot(value: unknown): value is RepositorySubscriptionSnapshot {
  return (
    isRecord(value) &&
    isRecord(value.repository) &&
    typeof value.repository.id === "string" &&
    typeof value.repository.actorUserId === "string" &&
    typeof value.repository.ownerLogin === "string" &&
    typeof value.repository.name === "string" &&
    isSubscriptionState(value.state) &&
    Number.isSafeInteger(value.version)
  );
}
