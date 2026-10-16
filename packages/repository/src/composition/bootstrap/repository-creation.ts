import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresRepositoryCreationPersistence } from "../../adapters/outbound/persistence/repository-creation.js";
import { PostgresRepositoryCreationOwnersQuery } from "../../adapters/outbound/persistence/repository-creation-owners.js";
import { CreateRepositoryUseCase } from "../../application/use-cases/create-repository.js";
import type {
  RepositoryCreateCommand,
  RepositoryCreationResult,
  RepositoryCreationStore,
  RepositoryOwnerOption,
} from "../../contracts/input/repository-creation.js";

export class PostgresRepositoryCreationStore implements RepositoryCreationStore {
  private readonly ownersQuery: PostgresRepositoryCreationOwnersQuery;
  private readonly useCase: CreateRepositoryUseCase;

  constructor(db: Database = businessDatabase()) {
    this.ownersQuery = new PostgresRepositoryCreationOwnersQuery(db);
    this.useCase = new CreateRepositoryUseCase(new PostgresRepositoryCreationPersistence(db));
  }

  owners(userId: string): Promise<readonly RepositoryOwnerOption[]> {
    return this.ownersQuery.owners(userId);
  }

  create(
    userId: string,
    command: RepositoryCreateCommand,
    now: number,
  ): Promise<RepositoryCreationResult> {
    return this.useCase.create(userId, command, now);
  }
}
