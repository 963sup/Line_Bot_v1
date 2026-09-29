import type { ProjectOwnerKind } from "../../domain/value-objects/project-owner-kind.js";

export type ProjectSummary = Readonly<{
  id: string;
  ownerLogin: string;
  ownerKind: ProjectOwnerKind;
  name: string;
  version: number;
}>;

export type ProjectList = Readonly<{
  items: readonly ProjectSummary[];
}>;
