import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import {
  type ProjectFieldValue,
  type ProjectManagementCommand,
  type ProjectManagementReceipt,
  type ProjectManagementStore,
  type ProjectManagementView,
  parseProjectManagementCommand,
} from "../contracts/management.js";
import {
  colors,
  fieldTypes,
  id,
  isRecord,
  layouts,
  statuses,
} from "../contracts/management-command.js";
import type { ProjectLifecyclePersistence } from "../contracts/output/project-lifecycle.js";
import { ProjectError } from "../domain.js";
import { executeProjectLifecycle } from "./use-cases/project-lifecycle.js";

export { parseProjectManagementCommand } from "../contracts/management.js";

const accessRoles: readonly ProjectManagementView["role"][] = ["READ", "WRITE", "ADMIN"];
const itemKinds: readonly ProjectManagementView["items"][number]["kind"][] = [
  "ISSUE",
  "DRAFT_ISSUE",
];
const managementActions: readonly ProjectManagementCommand["action"][] = [
  "set-repository-import",
  "create-project",
  "adopt-project",
  "update-project",
  "close-project",
  "reopen-project",
  "delete-project",
  "copy-project",
  "update-collaborators",
  "add-issue-item",
  "add-draft-item",
  "update-draft-item",
  "archive-item",
  "unarchive-item",
  "delete-item",
  "move-item",
  "convert-draft-item",
  "create-field",
  "update-field",
  "delete-field",
  "set-field-value",
  "clear-field-value",
  "create-view",
  "update-view",
  "delete-view",
  "create-status-update",
  "update-status-update",
  "delete-status-update",
];

function responseError(label: string): never {
  throw new ProjectError(503, `${label}格式不正確。`);
}

function responseRecord(
  value: unknown,
  label: string,
  allowed: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value)) responseError(label);
  if (Object.keys(value).some((key) => !allowed.includes(key))) responseError(label);
  return value;
}

function responseString(value: unknown, label: string): string {
  if (typeof value !== "string") responseError(label);
  return value;
}

function responseNullableString(value: unknown, label: string): string | null {
  return value === null ? null : responseString(value, label);
}

function responseBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") responseError(label);
  return value;
}

function responseInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) responseError(label);
  return value;
}

function responseNullableInteger(value: unknown, label: string): number | null {
  return value === null ? null : responseInteger(value, label);
}

function responseNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) responseError(label);
  return value;
}

function responseOneOf<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  label: string,
): Value {
  for (const candidate of allowed) {
    if (value === candidate) return candidate;
  }
  return responseError(label);
}

function responseArray<Value>(
  value: unknown,
  label: string,
  parse: (item: unknown, label: string) => Value,
): Value[] {
  if (!Array.isArray(value)) responseError(label);
  return value.map((item, index) => parse(item, `${label}[${index}]`));
}

function responseStringArray(value: unknown, label: string): string[] {
  return responseArray(value, label, responseString);
}

function parseProjectRoot(value: unknown, label: string): ProjectManagementView["project"] {
  const record = responseRecord(value, label, [
    "id",
    "ownerAccountId",
    "ownerKind",
    "number",
    "creator",
    "title",
    "shortDescription",
    "readme",
    "public",
    "closed",
    "closedAt",
    "deleted",
    "version",
    "createdAt",
    "updatedAt",
  ]);
  return {
    id: responseString(record.id, `${label}.id`),
    ownerAccountId: responseString(record.ownerAccountId, `${label}.ownerAccountId`),
    ownerKind: responseOneOf(record.ownerKind, ["USER", "ORGANIZATION"], `${label}.ownerKind`),
    number: responseNullableInteger(record.number, `${label}.number`),
    creator: responseNullableString(record.creator, `${label}.creator`),
    title: responseString(record.title, `${label}.title`),
    shortDescription: responseString(record.shortDescription, `${label}.shortDescription`),
    readme: responseString(record.readme, `${label}.readme`),
    public: responseBoolean(record.public, `${label}.public`),
    closed: responseBoolean(record.closed, `${label}.closed`),
    closedAt: responseNullableInteger(record.closedAt, `${label}.closedAt`),
    deleted: responseBoolean(record.deleted, `${label}.deleted`),
    version: responseInteger(record.version, `${label}.version`),
    createdAt: responseInteger(record.createdAt, `${label}.createdAt`),
    updatedAt: responseInteger(record.updatedAt, `${label}.updatedAt`),
  };
}

function parseProjectCollaborator(
  value: unknown,
  label: string,
): ProjectManagementView["collaborators"][number] {
  const record = responseRecord(value, label, ["kind", "id", "role"]);
  return {
    kind: responseOneOf(record.kind, ["USER", "TEAM"], `${label}.kind`),
    id: responseString(record.id, `${label}.id`),
    role: responseOneOf(record.role, accessRoles, `${label}.role`),
  };
}

function parseProjectIssueReference(
  value: unknown,
  label: string,
): NonNullable<ProjectManagementView["items"][number]["issue"]> {
  const record = responseRecord(value, label, [
    "id",
    "repositoryId",
    "number",
    "title",
    "state",
    "version",
  ]);
  return {
    id: responseString(record.id, `${label}.id`),
    repositoryId: responseString(record.repositoryId, `${label}.repositoryId`),
    number: responseInteger(record.number, `${label}.number`),
    title: responseString(record.title, `${label}.title`),
    state: responseOneOf(record.state, ["OPEN", "CLOSED"], `${label}.state`),
    version: responseInteger(record.version, `${label}.version`),
  };
}

function parseProjectDraftIssue(
  value: unknown,
  label: string,
): NonNullable<ProjectManagementView["items"][number]["draft"]> {
  const record = responseRecord(value, label, [
    "id",
    "title",
    "body",
    "assigneeIds",
    "deleted",
    "version",
    "createdAt",
    "updatedAt",
  ]);
  return {
    id: responseString(record.id, `${label}.id`),
    title: responseNullableString(record.title, `${label}.title`),
    body: responseNullableString(record.body, `${label}.body`),
    assigneeIds: responseStringArray(record.assigneeIds, `${label}.assigneeIds`),
    deleted: responseBoolean(record.deleted, `${label}.deleted`),
    version: responseInteger(record.version, `${label}.version`),
    createdAt: responseInteger(record.createdAt, `${label}.createdAt`),
    updatedAt: responseInteger(record.updatedAt, `${label}.updatedAt`),
  };
}

function parseProjectItem(value: unknown, label: string): ProjectManagementView["items"][number] {
  const record = responseRecord(value, label, [
    "id",
    "projectId",
    "kind",
    "archived",
    "position",
    "version",
    "issue",
    "draft",
  ]);
  const kind = responseOneOf(record.kind, itemKinds, `${label}.kind`);
  const issue =
    record.issue === null ? null : parseProjectIssueReference(record.issue, `${label}.issue`);
  const draft =
    record.draft === null ? null : parseProjectDraftIssue(record.draft, `${label}.draft`);
  if ((kind === "ISSUE" && (!issue || draft)) || (kind === "DRAFT_ISSUE" && (!draft || issue))) {
    responseError(label);
  }
  return {
    id: responseString(record.id, `${label}.id`),
    projectId: responseString(record.projectId, `${label}.projectId`),
    kind,
    archived: responseBoolean(record.archived, `${label}.archived`),
    position: responseInteger(record.position, `${label}.position`),
    version: responseInteger(record.version, `${label}.version`),
    issue,
    draft,
  };
}

function parseProjectFieldOption(
  value: unknown,
  label: string,
): ProjectManagementView["fields"][number]["options"][number] {
  const record = responseRecord(value, label, [
    "id",
    "name",
    "color",
    "description",
    "position",
    "version",
  ]);
  return {
    id: responseString(record.id, `${label}.id`),
    name: responseString(record.name, `${label}.name`),
    color: responseOneOf(record.color, colors, `${label}.color`),
    description: responseString(record.description, `${label}.description`),
    position: responseInteger(record.position, `${label}.position`),
    version: responseInteger(record.version, `${label}.version`),
  };
}

function parseProjectFieldIteration(
  value: unknown,
  label: string,
): ProjectManagementView["fields"][number]["iterations"][number] {
  const record = responseRecord(value, label, [
    "id",
    "title",
    "startDate",
    "duration",
    "position",
    "version",
  ]);
  return {
    id: responseString(record.id, `${label}.id`),
    title: responseString(record.title, `${label}.title`),
    startDate: responseString(record.startDate, `${label}.startDate`),
    duration: responseInteger(record.duration, `${label}.duration`),
    position: responseInteger(record.position, `${label}.position`),
    version: responseInteger(record.version, `${label}.version`),
  };
}

function parseProjectField(value: unknown, label: string): ProjectManagementView["fields"][number] {
  const record = responseRecord(value, label, [
    "id",
    "projectId",
    "name",
    "dataType",
    "options",
    "iterations",
    "version",
    "createdAt",
    "updatedAt",
  ]);
  return {
    id: responseString(record.id, `${label}.id`),
    projectId: responseString(record.projectId, `${label}.projectId`),
    name: responseString(record.name, `${label}.name`),
    dataType: responseOneOf(record.dataType, fieldTypes, `${label}.dataType`),
    options: responseArray(record.options, `${label}.options`, parseProjectFieldOption),
    iterations: responseArray(record.iterations, `${label}.iterations`, parseProjectFieldIteration),
    version: responseInteger(record.version, `${label}.version`),
    createdAt: responseInteger(record.createdAt, `${label}.createdAt`),
    updatedAt: responseInteger(record.updatedAt, `${label}.updatedAt`),
  };
}

function parseProjectFieldValue(value: unknown, label: string): ProjectFieldValue {
  const record = responseRecord(value, label, [
    "type",
    "date",
    "iterationId",
    "optionIds",
    "number",
    "optionId",
    "text",
  ]);
  if (record.type === "DATE") {
    responseRecord(record, label, ["type", "date"]);
    return { type: "DATE", date: responseString(record.date, `${label}.date`) };
  }
  if (record.type === "ITERATION") {
    responseRecord(record, label, ["type", "iterationId"]);
    return {
      type: "ITERATION",
      iterationId: responseString(record.iterationId, `${label}.iterationId`),
    };
  }
  if (record.type === "MULTI_SELECT") {
    responseRecord(record, label, ["type", "optionIds"]);
    return {
      type: "MULTI_SELECT",
      optionIds: responseStringArray(record.optionIds, `${label}.optionIds`),
    };
  }
  if (record.type === "NUMBER") {
    responseRecord(record, label, ["type", "number"]);
    return { type: "NUMBER", number: responseNumber(record.number, `${label}.number`) };
  }
  if (record.type === "SINGLE_SELECT") {
    responseRecord(record, label, ["type", "optionId"]);
    return {
      type: "SINGLE_SELECT",
      optionId: responseString(record.optionId, `${label}.optionId`),
    };
  }
  if (record.type === "TEXT") {
    responseRecord(record, label, ["type", "text"]);
    return { type: "TEXT", text: responseString(record.text, `${label}.text`) };
  }
  return responseError(label);
}

function parseProjectItemFieldValue(
  value: unknown,
  label: string,
): ProjectManagementView["fieldValues"][number] {
  const record = responseRecord(value, label, [
    "itemId",
    "fieldId",
    "value",
    "version",
    "updatedAt",
  ]);
  return {
    itemId: responseString(record.itemId, `${label}.itemId`),
    fieldId: responseString(record.fieldId, `${label}.fieldId`),
    value: parseProjectFieldValue(record.value, `${label}.value`),
    version: responseInteger(record.version, `${label}.version`),
    updatedAt: responseInteger(record.updatedAt, `${label}.updatedAt`),
  };
}

function parseProjectView(value: unknown, label: string): ProjectManagementView["views"][number] {
  const record = responseRecord(value, label, [
    "id",
    "projectId",
    "number",
    "name",
    "layout",
    "visibleFieldIds",
    "version",
    "createdAt",
    "updatedAt",
  ]);
  return {
    id: responseString(record.id, `${label}.id`),
    projectId: responseString(record.projectId, `${label}.projectId`),
    number: responseInteger(record.number, `${label}.number`),
    name: responseString(record.name, `${label}.name`),
    layout: responseOneOf(record.layout, layouts, `${label}.layout`),
    visibleFieldIds: responseStringArray(record.visibleFieldIds, `${label}.visibleFieldIds`),
    version: responseInteger(record.version, `${label}.version`),
    createdAt: responseInteger(record.createdAt, `${label}.createdAt`),
    updatedAt: responseInteger(record.updatedAt, `${label}.updatedAt`),
  };
}

function parseProjectStatusUpdate(
  value: unknown,
  label: string,
): ProjectManagementView["statusUpdates"][number] {
  const record = responseRecord(value, label, [
    "id",
    "projectId",
    "author",
    "body",
    "status",
    "startDate",
    "targetDate",
    "version",
    "createdAt",
    "updatedAt",
  ]);
  return {
    id: responseString(record.id, `${label}.id`),
    projectId: responseString(record.projectId, `${label}.projectId`),
    author: responseString(record.author, `${label}.author`),
    body: responseNullableString(record.body, `${label}.body`),
    status:
      record.status === null ? null : responseOneOf(record.status, statuses, `${label}.status`),
    startDate: responseNullableString(record.startDate, `${label}.startDate`),
    targetDate: responseNullableString(record.targetDate, `${label}.targetDate`),
    version: responseInteger(record.version, `${label}.version`),
    createdAt: responseInteger(record.createdAt, `${label}.createdAt`),
    updatedAt: responseInteger(record.updatedAt, `${label}.updatedAt`),
  };
}

export function parseProjectManagementView(raw: unknown): ProjectManagementView {
  const value = responseRecord(raw, "Project view", [
    "project",
    "role",
    "collaborators",
    "items",
    "fields",
    "fieldValues",
    "views",
    "statusUpdates",
    "repositoryImports",
  ]);
  return {
    project: parseProjectRoot(value.project, "Project view.project"),
    role: responseOneOf(value.role, accessRoles, "Project view.role"),
    ...(value.repositoryImports === undefined
      ? {}
      : {
          repositoryImports: responseArray(
            value.repositoryImports,
            "Project view.repositoryImports",
            (raw, label) => {
              const record = responseRecord(raw, label, [
                "repositoryId",
                "repositoryName",
                "ownerLogin",
                "state",
                "enabled",
              ]);
              return {
                repositoryId: responseString(record.repositoryId, `${label}.repositoryId`),
                repositoryName: responseString(record.repositoryName, `${label}.repositoryName`),
                ownerLogin: responseString(record.ownerLogin, `${label}.ownerLogin`),
                state: responseOneOf(
                  record.state,
                  ["OPEN", "CLOSED", "ALL"] as const,
                  `${label}.state`,
                ),
                enabled: responseBoolean(record.enabled, `${label}.enabled`),
              };
            },
          ),
        }),
    collaborators: responseArray(
      value.collaborators,
      "Project view.collaborators",
      parseProjectCollaborator,
    ),
    items: responseArray(value.items, "Project view.items", parseProjectItem),
    fields: responseArray(value.fields, "Project view.fields", parseProjectField),
    fieldValues: responseArray(
      value.fieldValues,
      "Project view.fieldValues",
      parseProjectItemFieldValue,
    ),
    views: responseArray(value.views, "Project view.views", parseProjectView),
    statusUpdates: responseArray(
      value.statusUpdates,
      "Project view.statusUpdates",
      parseProjectStatusUpdate,
    ),
  };
}

export function parseProjectManagementReceipt(raw: unknown): ProjectManagementReceipt {
  const value = responseRecord(raw, "Project receipt", [
    "requestId",
    "action",
    "projectId",
    "resourceId",
    "version",
    "at",
    "data",
  ]);
  if (!isRecord(value.data)) responseError("Project receipt.data");
  return {
    requestId: responseString(value.requestId, "Project receipt.requestId"),
    action: responseOneOf(value.action, managementActions, "Project receipt.action"),
    projectId: responseString(value.projectId, "Project receipt.projectId"),
    resourceId: responseNullableString(value.resourceId, "Project receipt.resourceId"),
    version: responseInteger(value.version, "Project receipt.version"),
    at: responseInteger(value.at, "Project receipt.at"),
    data: value.data,
  };
}

export function createProjectManagement(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): ProjectManagementStore;
  lifecycle(): ProjectLifecyclePersistence;
  now(): number;
}) {
  async function identity(subject: string) {
    return { userId: (await deps.activeUser(subject)).id };
  }

  return {
    view: async (subject: string, projectId: string) =>
      deps.store().view(await identity(subject), id(projectId, "Project 識別碼")),
    viewByNumber: async (subject: string, ownerLogin: string, projectNumber: number | string) => {
      let owner: string;
      try {
        owner = normalizeAccountLogin(ownerLogin);
      } catch {
        throw new ProjectError(400, "Project owner login 不正確。");
      }
      const number =
        typeof projectNumber === "string" && projectNumber.trim()
          ? Number(projectNumber)
          : projectNumber;
      if (!Number.isSafeInteger(number) || Number(number) < 1) {
        throw new ProjectError(400, "Project number 不正確。");
      }
      return deps.store().viewByNumber(await identity(subject), owner, Number(number));
    },
    command: async (subject: string, raw: unknown) => {
      const store = deps.store();
      const actor = await identity(subject);
      const command = parseProjectManagementCommand(raw);
      const now = deps.now();
      return command.action === "close-project" || command.action === "reopen-project"
        ? executeProjectLifecycle(deps.lifecycle(), actor, command, now)
        : store.execute(actor, command, now);
    },
  };
}
