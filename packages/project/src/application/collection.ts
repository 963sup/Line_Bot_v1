import type { ProjectList } from "../contracts/project-collection.js";
import type { ProjectCollectionStore } from "./ports/collection.js";

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
