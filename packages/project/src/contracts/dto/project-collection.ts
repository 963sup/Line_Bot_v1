import type {
  ProjectAccessRole,
  ProjectOwnerKind,
} from "../../domain.js";

export type ProjectSummary = Readonly<{
  id: string;
  ownerLogin: string;
  ownerKind: ProjectOwnerKind;
  number: number | null;
  name: string;
  public: boolean;
  closed: boolean;
  role: ProjectAccessRole;
  version: number;
}>;

export type ProjectList = Readonly<{
  items: readonly ProjectSummary[];
}>;
