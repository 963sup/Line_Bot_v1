import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import type { RepositoryCollectionStore } from "../contracts/output/collection.js";
import type { RepositorySummary } from "../domain.js";
import { accessibleRepositories } from "./access.js";

export class PostgresRepositoryCollectionStore implements RepositoryCollectionStore {
  constructor(private db: Database = businessDatabase()) {}

  accessible(userId: string): Promise<RepositorySummary[]> {
    return this.db.transaction((sql) => accessibleRepositories(sql, userId));
  }
}
