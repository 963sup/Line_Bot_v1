import { createRepositorySubscription } from "@line_bot_v1/repository/application/subscription";
import { PostgresRepositorySubscriptionStore } from "@line_bot_v1/repository/postgres/subscription";
import { activeLineUser } from "./account.server";

let store: PostgresRepositorySubscriptionStore | undefined;

export const repositorySubscription = createRepositorySubscription({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositorySubscriptionStore()),
  now: Date.now,
});
