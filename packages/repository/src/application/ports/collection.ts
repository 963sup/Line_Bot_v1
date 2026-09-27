import type { RepositorySummary } from "../../domain.js";

export interface RepositoryCollectionStore {
  accessible(userId: string): Promise<RepositorySummary[]>;
}
