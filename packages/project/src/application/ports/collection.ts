import type { ProjectSummary } from "../../contracts/project-collection.js";

export interface ProjectCollectionStore {
  accessible(userId: string): Promise<readonly ProjectSummary[]>;
}
