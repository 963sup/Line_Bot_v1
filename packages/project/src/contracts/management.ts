import type {
  ProjectAccessRole,
  ProjectCollaboratorRole,
  ProjectFieldDataType,
  ProjectOptionColor,
  ProjectOwnerKind,
  ProjectStatusUpdateStatus,
  ProjectViewLayout,
} from "../domain.js";

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

export type ProjectFieldValue =
  | Readonly<{ type: "DATE"; date: string }>
  | Readonly<{ type: "ITERATION"; iterationId: string }>
  | Readonly<{ type: "MULTI_SELECT"; optionIds: readonly string[] }>
  | Readonly<{ type: "NUMBER"; number: number }>
  | Readonly<{ type: "SINGLE_SELECT"; optionId: string }>
  | Readonly<{ type: "TEXT"; text: string }>;

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
  project: ProjectRoot;
  role: ProjectAccessRole;
  collaborators: readonly ProjectCollaborator[];
  items: readonly ProjectItem[];
  fields: readonly ProjectField[];
  fieldValues: readonly ProjectItemFieldValue[];
  views: readonly ProjectView[];
  statusUpdates: readonly ProjectStatusUpdate[];
}>;

type CommandBase = Readonly<{
  requestId: string;
}>;

type ExistingProjectBase = CommandBase &
  Readonly<{
    projectId: string;
    expectedVersion: number;
  }>;

export type ProjectFieldOptionInput = Readonly<{
  id?: string;
  name: string;
  color: ProjectOptionColor;
  description: string;
}>;

export type ProjectIterationInput = Readonly<{
  id?: string;
  title: string;
  startDate: string;
  duration: number;
}>;

export type ProjectCollaboratorInput = Readonly<{
  role: ProjectCollaboratorRole;
  userId?: string;
  teamId?: string;
}>;

export type ProjectManagementCommand =
  | (CommandBase &
      Readonly<{
        action: "create-project";
        ownerAccountId: string;
        ownerKind: ProjectOwnerKind;
        expectedVersion: 0;
        title: string;
        public: boolean;
        repositoryId: string | null;
        teamId: string | null;
      }>)
  | (ExistingProjectBase & Readonly<{ action: "adopt-project" }>)
  | (ExistingProjectBase &
      Readonly<{
        action: "update-project";
        title?: string;
        shortDescription?: string;
        readme?: string;
        public?: boolean;
      }>)
  | (ExistingProjectBase &
      Readonly<{ action: "close-project" | "reopen-project" | "delete-project" }>)
  | (CommandBase &
      Readonly<{
        action: "copy-project";
        sourceProjectId: string;
        sourceExpectedVersion: number;
        ownerAccountId: string;
        ownerKind: ProjectOwnerKind;
        expectedVersion: 0;
        title: string;
        includeDraftIssues: boolean;
      }>)
  | (ExistingProjectBase &
      Readonly<{
        action: "update-collaborators";
        collaborators: readonly ProjectCollaboratorInput[];
      }>)
  | (ExistingProjectBase &
      Readonly<{ action: "add-issue-item"; issueId: string }>)
  | (ExistingProjectBase &
      Readonly<{
        action: "add-draft-item";
        title: string;
        body: string;
        assigneeIds: readonly string[];
      }>)
  | (ExistingProjectBase &
      Readonly<{
        action: "update-draft-item";
        itemId: string;
        draftVersion: number;
        title?: string;
        body?: string;
        assigneeIds?: readonly string[];
      }>)
  | (ExistingProjectBase &
      Readonly<{
        action: "archive-item" | "unarchive-item" | "delete-item";
        itemId: string;
        itemVersion: number;
      }>)
  | (ExistingProjectBase &
      Readonly<{
        action: "move-item";
        itemId: string;
        itemVersion: number;
        beforeItemId: string | null;
      }>)
  | (ExistingProjectBase &
      Readonly<{
        action: "convert-draft-item";
        itemId: string;
        itemVersion: number;
        repositoryId: string;
      }>)
  | (ExistingProjectBase &
      Readonly<{
        action: "create-field";
        name: string;
        dataType: ProjectFieldDataType;
        options: readonly ProjectFieldOptionInput[];
        iterations: readonly ProjectIterationInput[];
      }>)
  | (ExistingProjectBase &
      Readonly<{
        action: "update-field";
        fieldId: string;
        fieldVersion: number;
        name?: string;
        options?: readonly ProjectFieldOptionInput[];
        iterations?: readonly ProjectIterationInput[];
      }>)
  | (ExistingProjectBase &
      Readonly<{
        action: "delete-field";
        fieldId: string;
        fieldVersion: number;
      }>)
  | (ExistingProjectBase &
      Readonly<{
        action: "set-field-value";
        itemId: string;
        fieldId: string;
        value: ProjectFieldValue;
      }>)
  | (ExistingProjectBase &
      Readonly<{
        action: "clear-field-value";
        itemId: string;
        fieldId: string;
      }>)
  | (ExistingProjectBase &
      Readonly<{
        action: "create-view";
        name: string;
        layout: ProjectViewLayout;
        visibleFieldIds: readonly string[];
      }>)
  | (ExistingProjectBase &
      Readonly<{
        action: "update-view";
        viewId: string;
        viewVersion: number;
        name?: string;
        layout?: ProjectViewLayout;
        visibleFieldIds?: readonly string[];
      }>)
  | (ExistingProjectBase &
      Readonly<{
        action: "delete-view";
        viewId: string;
        viewVersion: number;
      }>)
  | (ExistingProjectBase &
      Readonly<{
        action: "create-status-update";
        body: string | null;
        status: ProjectStatusUpdateStatus | null;
        startDate: string | null;
        targetDate: string | null;
      }>)
  | (ExistingProjectBase &
      Readonly<{
        action: "update-status-update";
        statusUpdateId: string;
        statusUpdateVersion: number;
        body?: string | null;
        status?: ProjectStatusUpdateStatus | null;
        startDate?: string | null;
        targetDate?: string | null;
      }>)
  | (ExistingProjectBase &
      Readonly<{
        action: "delete-status-update";
        statusUpdateId: string;
        statusUpdateVersion: number;
      }>);

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
    command: ProjectManagementCommand,
    now: number,
  ): Promise<ProjectManagementReceipt>;
}
