import type { ContentPlanRevision } from "../../domain/plan.js";

export interface ContentPlans {
  load(): Promise<ContentPlanRevision | null>;
  save(next: ContentPlanRevision, expectedVersion: number): Promise<void>;
}
