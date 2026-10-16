import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresRepositoryAccessPersistence } from "../../adapters/outbound/persistence/repository-access.js";
import { PostgresRepositoryAccessQuery } from "../../adapters/outbound/persistence/repository-access-query.js";
import { RepositoryAccessMutationUseCase } from "../../application/use-cases/repository-access-mutation.js";
import type {
  RepositoryAccessCommand,
  RepositoryAccessReceipt,
  RepositoryAccessSnapshot,
  RepositoryAccessStore,
} from "../../contracts/input/repository-access.js";
import type { RepositorySelector } from "../../contracts/selectors.js";

export class PostgresRepositoryAccessStore implements RepositoryAccessStore {
  private readonly query: PostgresRepositoryAccessQuery;
  private readonly mutation: RepositoryAccessMutationUseCase;

  constructor(db: Database = businessDatabase()) {
    this.query = new PostgresRepositoryAccessQuery(db);
    this.mutation = new RepositoryAccessMutationUseCase(
      new PostgresRepositoryAccessPersistence(db),
    );
  }

  view(userId: string, selector: RepositorySelector): Promise<RepositoryAccessSnapshot> {
    return this.query.view(userId, selector);
  }

  execute(
    userId: string,
    command: RepositoryAccessCommand,
    now: number,
  ): Promise<RepositoryAccessReceipt> {
    return this.mutation.execute(userId, command, now);
  }
}
