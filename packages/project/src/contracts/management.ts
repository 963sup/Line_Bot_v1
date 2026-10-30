import type { ProjectLifecycleAction } from "../domain/project-lifecycle.js";
import type {
  ProjectAccessRole,
  ProjectFieldDataType,
  ProjectOptionColor,
  ProjectOwnerKind,
  ProjectStatusUpdateStatus,
  ProjectViewLayout,
} from "../domain.js";
import type { ProjectFieldValue, ProjectManagementCommand } from "./management-command.js";

export type ProjectRoot = Readonly<{
  id: string;
  ownerAccountId: string;
  ownerKind: ProjectOwnerKind;
  number: number | null;
  creator: string | null;
  title: string;
  shortDescription: string;
  readme: string;
  public: boolean;
  closed: boolean;
  closedAt: number | null;
  deleted: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
}>;

export type ProjectCollaborator = Readonly<{
  kind: "USER" | "TEAM";
  id: string;
  role: ProjectAccessRole;
}>;

type ProjectIssueReference = Readonly<{
  id: string;
  repositoryId: string;
  number: number;
  title: string;
  state: "OPEN" | "CLOSED";
  version: number;
}>;

export type ProjectDraftIssue = Readonly<{
  id: string;
  title: string | null;
  body: string | null;
  assigneeIds: readonly string[];
  deleted: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
}>;

export type ProjectItem = Readonly<{
  id: string;
  projectId: string;
  kind: "ISSUE" | "DRAFT_ISSUE";
  archived: boolean;
  position: number;
  version: number;
  issue: ProjectIssueReference | null;
  draft: ProjectDraftIssue | null;
}>;

export type ProjectFieldOption = Readonly<{
  id: string;
  name: string;
  color: ProjectOptionColor;
  description: string;
  position: number;
  version: number;
}>;

export type ProjectFieldIteration = Readonly<{
  id: string;
  title: string;
  startDate: string;
  duration: number;
  position: number;
  version: number;
}>;

export type ProjectField = Readonly<{
  id: string;
  projectId: string;
  name: string;
  dataType: ProjectFieldDataType;
  options: readonly ProjectFieldOption[];
  iterations: readonly ProjectFieldIteration[];
  version: number;
  createdAt: number;
  updatedAt: number;
}>;

export type ProjectItemFieldValue = Readonly<{
  itemId: string;
  fieldId: string;
  value: ProjectFieldValue;
  version: number;
  updatedAt: number;
}>;

export type ProjectView = Readonly<{
  id: string;
  projectId: string;
  number: number;
  name: string;
  layout: ProjectViewLayout;
  visibleFieldIds: readonly string[];
  version: number;
  createdAt: number;
  updatedAt: number;
}>;

export type ProjectStatusUpdate = Readonly<{
  id: string;
  projectId: string;
  author: string;
  body: string | null;
  status: ProjectStatusUpdateStatus | null;
  startDate: string | null;
  targetDate: string | null;
  version: number;
  createdAt: number;
  updatedAt: number;
}>;

export type ProjectManagementView = Readonly<{
  repositoryImports?: readonly Readonly<{
    repositoryId: string;
    repositoryName: string;
    ownerLogin: string;
    state: "OPEN" | "CLOSED" | "ALL";
    enabled: boolean;
  }>[];
  project: ProjectRoot;
  role: ProjectAccessRole;
  collaborators: readonly ProjectCollaborator[];
  items: readonly ProjectItem[];
  fields: readonly ProjectField[];
  fieldValues: readonly ProjectItemFieldValue[];
  views: readonly ProjectView[];
  statusUpdates: readonly ProjectStatusUpdate[];
}>;

export type ProjectManagementReceipt = Readonly<{
  requestId: string;
  action: ProjectManagementCommand["action"];
  projectId: string;
  resourceId: string | null;
  version: number;
  at: number;
  data: Readonly<Record<string, unknown>>;
}>;

export type ProjectManagementIdentity = Readonly<{ userId: string }>;

export interface ProjectManagementStore {
  view(identity: ProjectManagementIdentity, projectId: string): Promise<ProjectManagementView>;
  viewByNumber(
    identity: ProjectManagementIdentity,
    ownerLogin: string,
    projectNumber: number,
  ): Promise<ProjectManagementView>;
  execute(
    identity: ProjectManagementIdentity,
    command: Exclude<ProjectManagementCommand, { action: ProjectLifecycleAction }>,
    now: number,
  ): Promise<ProjectManagementReceipt>;
}

export {
  type ProjectCollaboratorInput,
  type ProjectFieldOptionInput,
  type ProjectFieldValue,
  type ProjectIterationInput,
  type ProjectManagementCommand,
  parseProjectManagementCommand,
} from "./management-command.js";
