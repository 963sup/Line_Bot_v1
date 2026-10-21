import type {
  ContentNodeKind,
  ContentPlanRevision,
  ContentResourceKind,
} from "../../domain/plan.js";
import type { QuantityUnit } from "../../domain/quantity.js";

type ContentMeasureDto = Readonly<{
  id: string;
  name: string;
  subject: string;
  unit: QuantityUnit;
}>;

type ContentPlanNodeDto = Readonly<{
  id: string;
  parentId: string | null;
  position: number;
  kind: ContentNodeKind;
  title: string;
  body: string;
  plannedQuantity: Readonly<{ measureId: string; value: string }> | null;
}>;

type ContentResourcePinDto = Readonly<{
  nodeId: string;
  resourceId: string;
  resourceRevisionId: string;
  kind: ContentResourceKind;
}>;

type ContentPlanDocumentDto = Readonly<{
  schemaVersion: 1;
  measures: readonly ContentMeasureDto[];
  nodes: readonly ContentPlanNodeDto[];
  resourcePins: readonly ContentResourcePinDto[];
}>;

export type ContentPlanRevisionDto = Readonly<{
  revisionId: string;
  repositoryId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  action: "initialize" | "replace";
  document: ContentPlanDocumentDto;
}>;

export type ContentPlanReceipt = Readonly<{
  requestId: string;
  revision: ContentPlanRevisionDto;
}>;

export type ContentPlanHistory = Readonly<{
  revisions: readonly ContentPlanRevisionDto[];
  next: number | null;
}>;

export function contentPlanRevisionDto(revision: ContentPlanRevision): ContentPlanRevisionDto {
  return {
    revisionId: revision.id,
    repositoryId: revision.repositoryId,
    version: revision.version,
    parentRevisionId: revision.parentRevisionId,
    actorUserId: revision.actorUserId,
    at: revision.at,
    action: revision.action,
    document: {
      schemaVersion: 1,
      measures: revision.document.measures.map((measure) => ({ ...measure })),
      nodes: revision.document.nodes.map((node) => ({
        ...node,
        plannedQuantity: node.plannedQuantity ? { ...node.plannedQuantity } : null,
      })),
      resourcePins: revision.document.resourcePins.map((pin) => ({ ...pin })),
    },
  };
}
