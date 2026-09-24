import { normalizeRepositoryName } from "../domain.js";
import type { PublicRepositoryStore } from "./ports/public.js";

export function createPublicRepositories(store: PublicRepositoryStore) {
  return {
    byOwnerAndName(ownerLogin: string, repository: string) {
      const name = normalizeRepositoryName(repository);
      return name ? store.byOwnerAndName(ownerLogin, name) : Promise.resolve(null);
    },
  };
}
