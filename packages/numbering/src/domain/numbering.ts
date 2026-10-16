const NUMBER_FAMILIES = [
  "repository-work-item",
  "repository-discussion",
  "repository-milestone",
  "account-project",
  "project-view",
] as const;

export type NumberFamily = (typeof NUMBER_FAMILIES)[number];

type RepositorySeries = Readonly<{
  family: "repository-work-item" | "repository-discussion" | "repository-milestone";
  scopeKind: "REPOSITORY";
  scopeId: string;
}>;

type AccountProjectSeries = Readonly<{
  family: "account-project";
  scopeKind: "USER" | "ORGANIZATION";
  scopeId: string;
}>;

type ProjectViewSeries = Readonly<{
  family: "project-view";
  scopeKind: "PROJECT";
  scopeId: string;
}>;

export type NumberSeriesRef = RepositorySeries | AccountProjectSeries | ProjectViewSeries;

export type NumberAllocationRequest =
  | (RepositorySeries &
      Readonly<{
        family: "repository-work-item";
        resourceKind: "ISSUE" | "PULL_REQUEST";
        resourceId: string;
        at: number;
      }>)
  | (RepositorySeries &
      Readonly<{
        family: "repository-discussion";
        resourceKind: "DISCUSSION";
        resourceId: string;
        at: number;
      }>)
  | (RepositorySeries &
      Readonly<{
        family: "repository-milestone";
        resourceKind: "MILESTONE";
        resourceId: string;
        at: number;
      }>)
  | (AccountProjectSeries &
      Readonly<{
        resourceKind: "PROJECT";
        resourceId: string;
        at: number;
      }>)
  | (ProjectViewSeries &
      Readonly<{
        resourceKind: "PROJECT_VIEW";
        resourceId: string;
        at: number;
      }>);

export type NumberAllocation = Readonly<{
  resourceKind: NumberAllocationRequest["resourceKind"];
  resourceId: string;
  number: number;
}>;

const MAX_SAFE_SCOPED_NUMBER = Number.MAX_SAFE_INTEGER;
export const MAX_PROJECT_VIEW_NUMBER = 2_147_483_647;

export function numberLimit(family: NumberFamily): number {
  return family === "project-view" ? MAX_PROJECT_VIEW_NUMBER : MAX_SAFE_SCOPED_NUMBER;
}

export class NumberingIntegrityError extends Error {}
