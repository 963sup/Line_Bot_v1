import type { ResourceAction, ResourceKind, ResourceState } from "../../domain/resource.js";

export type ResourceRevisionDto = Readonly<{
  revisionId: string;
  resourceId: string;
  repositoryId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  action: ResourceAction;
  kind: ResourceKind;
  name: string;
  description: string;
  state: ResourceState;
}>;

export type ResourceSummary = Readonly<{
  resourceId: string;
  revisionId: string;
  version: number;
  kind: ResourceKind;
  name: string;
  state: ResourceState;
  updatedAt: number;
}>;

export type ResourceReceipt = Readonly<{
  requestId: string;
  revision: ResourceRevisionDto;
}>;

export type ResourceList = Readonly<{
  resources: readonly ResourceSummary[];
  next: string | null;
}>;

export type ResourceHistory = Readonly<{
  revisions: readonly ResourceRevisionDto[];
  next: number | null;
}>;
