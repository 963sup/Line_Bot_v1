import type { ProjectSummary } from "../dto/project-collection.js";

export interface ProjectCollectionStore {
  accessible(userId: string): Promise<readonly ProjectSummary[]>;
}
