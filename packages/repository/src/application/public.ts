import { IssueError, normalizeRepositoryName } from "../domain.js";
import { accountLoginForRepositoryLocator } from "./owner-locator.js";
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
      const login = accountLoginForRepositoryLocator(ownerLogin);
      const name = normalizeRepositoryName(repository);
      return login && name ? store.byOwnerAndName(login, name) : Promise.resolve(null);
    },
    listByOwner(ownerLogin: string, limit = 6) {
      const login = accountLoginForRepositoryLocator(ownerLogin);
      return login
        ? store.listByOwner(login, publicListLimit(limit))
        : Promise.resolve({ items: [], totalCount: 0 });
    },
  };
}
