import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresRepositoryManagementPersistence } from "../../adapters/outbound/persistence/repository-management.js";
import { PostgresRepositoryManagementQuery } from "../../adapters/outbound/persistence/repository-management-query.js";
import { RepositoryManagementUseCase } from "../../application/use-cases/repository-lifecycle.js";
import type {
  RepositoryManagementCommand,
  RepositoryManagementReceipt,
  RepositoryManagementSnapshot,
  RepositoryManagementStore,
} from "../../contracts/input/repository-management.js";
import type { RepositorySelector } from "../../contracts/selectors.js";

export class PostgresRepositoryManagementStore implements RepositoryManagementStore {
  private readonly query: PostgresRepositoryManagementQuery;
  private readonly useCase: RepositoryManagementUseCase;

  constructor(db: Database = businessDatabase()) {
    this.query = new PostgresRepositoryManagementQuery(db);
    this.useCase = new RepositoryManagementUseCase(new PostgresRepositoryManagementPersistence(db));
  }

  view(userId: string, selector: RepositorySelector): Promise<RepositoryManagementSnapshot> {
    return this.query.view(userId, selector);
  }

  execute(
    userId: string,
    command: RepositoryManagementCommand,
    now: number,
  ): Promise<RepositoryManagementReceipt> {
    return this.useCase.execute(userId, command, now);
  }
}
