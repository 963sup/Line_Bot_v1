import type { ProjectList } from "../../contracts/dto/project-collection.js";
import type { ProjectCollectionStore } from "../../contracts/repositories/project-collection-store.js";

export function createProjectCollection(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): ProjectCollectionStore;
}) {
  return {
    async accessible(subject: string): Promise<ProjectList> {
      const userId = (await deps.activeUser(subject)).id;
      return { items: await deps.store().accessible(userId) };
    },
  };
}
