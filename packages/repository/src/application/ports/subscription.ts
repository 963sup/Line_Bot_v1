import type { RepositorySelector } from "../../contracts/selectors.js";

export type RepositorySubscriptionState = "SUBSCRIBED" | "UNSUBSCRIBED" | "IGNORED";

export type RepositorySubscriptionSnapshot = Readonly<{
  repository: {
    id: string;
    ownerLogin: string;
    name: string;
  };
  state: RepositorySubscriptionState;
  version: number;
}>;

export type RepositorySubscriptionCommand = Readonly<{
  action: "set";
  requestId: string;
  repositoryId: string;
  expectedVersion: number;
  state: RepositorySubscriptionState;
}>;

export type RepositorySubscriptionReceipt = Readonly<{
  requestId: string;
  repositoryId: string;
  state: RepositorySubscriptionState;
  version: number;
  at: number;
}>;

export interface RepositorySubscriptionStore {
  view(userId: string, selector: RepositorySelector): Promise<RepositorySubscriptionSnapshot>;
  execute(
    userId: string,
    command: RepositorySubscriptionCommand,
    now: number,
  ): Promise<RepositorySubscriptionReceipt>;
}
