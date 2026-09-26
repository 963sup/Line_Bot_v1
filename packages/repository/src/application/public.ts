import { IssueError, normalizeRepositoryName } from "../domain.js";
import type { PublicRepositoryStore } from "./ports/public.js";

function publicListLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 50) {
    throw new IssueError(400, "Repository 公開列表範圍不正確。");
  }
  return value;
}

export function createPublicRepositories(store: PublicRepositoryStore) {
  return {
    byOwnerAndName(ownerLogin: string, repository: string) {
      const name = normalizeRepositoryName(repository);
      return name ? store.byOwnerAndName(ownerLogin, name) : Promise.resolve(null);
    },
    listByOwner(ownerLogin: string, limit = 6) {
      return store.listByOwner(ownerLogin, publicListLimit(limit));
    },
  };
}
