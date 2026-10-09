import type { PublicRepositoryStore } from "../contracts/output/public.js";
import { normalizeRepositoryName, RepositoryError } from "../domain.js";
import { accountLoginForRepositoryLocator } from "./owner-locator.js";

function publicListLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 50) {
    throw new RepositoryError(400, "Repository 公開列表範圍不正確。");
  }
  return value;
}

export function createPublicRepositories(store: PublicRepositoryStore) {
  return {
    byOwnerAndName(ownerLogin: string, repository: string, followRenames = true) {
      const login = accountLoginForRepositoryLocator(ownerLogin);
      const name = normalizeRepositoryName(repository);
      return login && name
        ? store.byOwnerAndName(login, name, followRenames)
        : Promise.resolve(null);
    },
    listByOwner(ownerLogin: string, limit = 6) {
      const login = accountLoginForRepositoryLocator(ownerLogin);
      return login
        ? store.listByOwner(login, publicListLimit(limit))
        : Promise.resolve({ items: [], totalCount: 0 });
    },
    popularByOwner(ownerLogin: string, limit = 6) {
      const login = accountLoginForRepositoryLocator(ownerLogin);
      return login
        ? store.popularByOwner(login, publicListLimit(limit))
        : Promise.resolve({ items: [], totalCount: 0 });
    },
  };
}
