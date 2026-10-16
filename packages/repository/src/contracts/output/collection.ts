import type { RepositorySummary } from "../../domain/repository/entities/repository.js";

export interface RepositoryCollectionStore {
  accessible(userId: string): Promise<RepositorySummary[]>;
}
