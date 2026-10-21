import type { ResourceKind } from "./resource.js";

export type ResourceBasis = Readonly<{
  resourceId: string;
  resourceRevisionId: string;
  resourceVersion: number;
  kind: ResourceKind;
  name: string;
}>;
