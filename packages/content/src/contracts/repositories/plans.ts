import type { ContentPlanRevision } from "../../domain/plan.js";

export interface ContentPlans {
  load(): Promise<ContentPlanRevision | null>;
  hasContractDocumentImport(documentId: string, revisionId: string): Promise<boolean>;
  save(next: ContentPlanRevision, expectedVersion: number): Promise<void>;
}
