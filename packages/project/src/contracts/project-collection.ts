import type { ProjectOwnerKind } from "../domain/index.js";

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
