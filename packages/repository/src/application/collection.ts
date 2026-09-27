import type { RepositoryCollectionStore } from "./ports/collection.js";

export function createRepositoryCollection(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): RepositoryCollectionStore;
}) {
  return {
    accessible: async (subject: string) =>
      deps.store().accessible((await deps.activeUser(subject)).id),
  };
}
