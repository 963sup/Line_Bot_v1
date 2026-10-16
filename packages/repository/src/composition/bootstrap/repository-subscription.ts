import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresRepositorySubscriptionPersistence } from "../../adapters/outbound/persistence/repository-subscription.js";
import { PostgresRepositorySubscriptionQuery } from "../../adapters/outbound/persistence/repository-subscription-query.js";
import { RepositorySubscriptionMutationUseCase } from "../../application/use-cases/repository-subscription-mutation.js";
import type {
  RepositorySubscriptionCommand,
  RepositorySubscriptionReceipt,
  RepositorySubscriptionSnapshot,
  RepositorySubscriptionStore,
} from "../../contracts/input/repository-subscription.js";
import type { RepositorySelector } from "../../contracts/selectors.js";

export class PostgresRepositorySubscriptionStore implements RepositorySubscriptionStore {
  private readonly query: PostgresRepositorySubscriptionQuery;
  private readonly mutation: RepositorySubscriptionMutationUseCase;

  constructor(db: Database = businessDatabase()) {
    this.query = new PostgresRepositorySubscriptionQuery(db);
    this.mutation = new RepositorySubscriptionMutationUseCase(
      new PostgresRepositorySubscriptionPersistence(db),
    );
  }

  view(userId: string, selector: RepositorySelector): Promise<RepositorySubscriptionSnapshot> {
    return this.query.view(userId, selector);
  }

  execute(
    userId: string,
    command: RepositorySubscriptionCommand,
    now: number,
  ): Promise<RepositorySubscriptionReceipt> {
    return this.mutation.execute(userId, command, now);
  }
}
