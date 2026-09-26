import { businessDatabase, type Database } from "@line-work/platform/adapters/postgres";
import type { RepositoryCollectionStore } from "../../application/ports/collection.js";
import type { RepositorySummary } from "../../domain.js";
import { accessibleRepositories } from "./access.js";

export class PostgresRepositoryCollectionStore implements RepositoryCollectionStore {
  constructor(private db: Database = businessDatabase()) {}

  accessible(userId: string): Promise<RepositorySummary[]> {
    return this.db.transaction((sql) => accessibleRepositories(sql, userId));
  }
}
