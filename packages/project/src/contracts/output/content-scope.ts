import type { ProjectAccessRole, ProjectOwnerKind } from "../../domain.js";

export type ProjectContentScope = Readonly<{
  project: Readonly<{
    id: string;
    ownerAccountId: string;
    ownerKind: ProjectOwnerKind;
    title: string;
    number: number | null;
    public: boolean;
    hasCollaboratorGrants: boolean;
  }>;
  role: ProjectAccessRole;
  closed: boolean;
}>;

export interface ProjectContentScopeReader {
  read(userId: string, projectId: string): Promise<ProjectContentScope>;
}
