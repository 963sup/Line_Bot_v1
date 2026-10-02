import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import type {
  ProjectCollaboratorInput,
  ProjectFieldOptionInput,
  ProjectFieldValue,
  ProjectIterationInput,
  ProjectManagementCommand,
  ProjectManagementStore,
} from "../contracts/management.js";
import type {
  ProjectCollaboratorRole,
  ProjectFieldDataType,
  ProjectOptionColor,
  ProjectOwnerKind,
  ProjectStatusUpdateStatus,
  ProjectViewLayout,
} from "../domain.js";
import { ProjectError } from "../domain.js";

const requestIdPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const fieldTypes: readonly ProjectFieldDataType[] = [
  "DATE",
  "ITERATION",
  "MULTI_SELECT",
  "NUMBER",
  "SINGLE_SELECT",
  "TEXT",
];
const colors: readonly ProjectOptionColor[] = [
  "BLUE",
  "GRAY",
  "GREEN",
  "ORANGE",
  "PINK",
  "PURPLE",
  "RED",
  "YELLOW",
];
const layouts: readonly ProjectViewLayout[] = ["BOARD_LAYOUT", "ROADMAP_LAYOUT", "TABLE_LAYOUT"];
const statuses: readonly ProjectStatusUpdateStatus[] = [
  "AT_RISK",
  "COMPLETE",
  "INACTIVE",
  "OFF_TRACK",
  "ON_TRACK",
];
const collaboratorRoles: readonly ProjectCollaboratorRole[] = ["ADMIN", "NONE", "READER", "WRITER"];

function objectInput(value: unknown, label = "Project 操作"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProjectError(400, `${label}格式不正確。`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new ProjectError(400, "Project 操作含有未知欄位。");
  }
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > 128) {
    throw new ProjectError(400, `${label}不正確。`);
  }
  return value;
}

function text(value: unknown, label: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new ProjectError(400, `${label}不正確。`);
  const normalized = value.trim();
  if ((!allowEmpty && !normalized) || normalized.length > max) {
    throw new ProjectError(400, `${label}不正確。`);
  }
  return normalized;
}

function expectedVersion(value: unknown, create = false): number {
  if (!Number.isSafeInteger(value) || Number(value) < (create ? 0 : 1)) {
    throw new ProjectError(400, "Project 版本不正確。");
  }
  const result = Number(value);
  if (create && result !== 0) throw new ProjectError(400, "建立 Project 必須從版本 0 開始。");
  return result;
}

function requestBase(value: Record<string, unknown>) {
  if (typeof value.requestId !== "string" || !requestIdPattern.test(value.requestId)) {
    throw new ProjectError(400, "Project 請求編號不正確。");
  }
  return { requestId: value.requestId.toLowerCase() };
}

function current(value: Record<string, unknown>) {
  return {
    ...requestBase(value),
    projectId: id(value.projectId, "Project 識別碼"),
    expectedVersion: expectedVersion(value.expectedVersion),
  };
}

function ownerKind(value: unknown): ProjectOwnerKind {
  if (value !== "USER" && value !== "ORGANIZATION") {
    throw new ProjectError(400, "Project owner kind 不正確。");
  }
  return value;
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new ProjectError(400, `${label}不正確。`);
  return value;
}

function date(value: unknown, label: string): string {
  if (typeof value !== "string" || !datePattern.test(value)) {
    throw new ProjectError(400, `${label}不正確。`);
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new ProjectError(400, `${label}不正確。`);
  }
  return value;
}

function optionalDate(value: unknown, label: string): string | null {
  return value === null ? null : date(value, label);
}

function ids(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new ProjectError(400, `${label}格式不正確。`);
  return [...new Set(value.map((item) => id(item, label)))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function collaborators(value: unknown): ProjectCollaboratorInput[] {
  if (!Array.isArray(value)) throw new ProjectError(400, "Project collaborators 格式不正確。");
  return value.map((item) => {
    const record = objectInput(item, "Project collaborator");
    exactKeys(record, ["role", "userId", "teamId"]);
    if (!collaboratorRoles.includes(record.role as ProjectCollaboratorRole)) {
      throw new ProjectError(400, "Project collaborator role 不正確。");
    }
    const userId = record.userId === undefined ? undefined : id(record.userId, "User 識別碼");
    const teamId = record.teamId === undefined ? undefined : id(record.teamId, "Team 識別碼");
    if (Boolean(userId) === Boolean(teamId)) {
      throw new ProjectError(400, "Project collaborator 必須 userId/teamId 二選一。");
    }
    return {
      role: record.role as ProjectCollaboratorRole,
      ...(userId ? { userId } : {}),
      ...(teamId ? { teamId } : {}),
    };
  });
}

function options(value: unknown): ProjectFieldOptionInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ProjectError(400, "Project field options 格式不正確。");
  const parsed = value.map((item) => {
    const record = objectInput(item, "Project field option");
    exactKeys(record, ["id", "name", "color", "description"]);
    if (!colors.includes(record.color as ProjectOptionColor)) {
      throw new ProjectError(400, "Project field option color 不正確。");
    }
    return {
      ...(record.id === undefined ? {} : { id: id(record.id, "Option 識別碼") }),
      name: text(record.name, "Option 名稱", 120),
      color: record.color as ProjectOptionColor,
      description: text(record.description ?? "", "Option 描述", 500, true),
    };
  });
  const names = parsed.map((item) => item.name);
  if (new Set(names).size !== names.length) {
    throw new ProjectError(400, "Project field option 名稱不可重複。");
  }
  return parsed;
}

function iterations(value: unknown): ProjectIterationInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ProjectError(400, "Project iterations 格式不正確。");
  return value.map((item) => {
    const record = objectInput(item, "Project iteration");
    exactKeys(record, ["id", "title", "startDate", "duration"]);
    if (
      !Number.isSafeInteger(record.duration) ||
      Number(record.duration) < 1 ||
      Number(record.duration) > 3650
    ) {
      throw new ProjectError(400, "Iteration duration 不正確。");
    }
    return {
      ...(record.id === undefined ? {} : { id: id(record.id, "Iteration 識別碼") }),
      title: text(record.title, "Iteration title", 120),
      startDate: date(record.startDate, "Iteration startDate"),
      duration: Number(record.duration),
    };
  });
}

function fieldValue(value: unknown): ProjectFieldValue {
  const record = objectInput(value, "Project field value");
  exactKeys(record, [
    "date",
    "iterationId",
    "multiSelectOptionIds",
    "number",
    "singleSelectOptionId",
    "text",
  ]);
  const present = Object.entries(record).filter(([, item]) => item !== undefined && item !== null);
  if (present.length !== 1) {
    throw new ProjectError(400, "Project field value 必須恰好指定一種 typed value。");
  }
  const [key, item] = present[0]!;
  if (key === "date") return { type: "DATE", date: date(item, "Field date") };
  if (key === "iterationId") {
    return { type: "ITERATION", iterationId: id(item, "Iteration 識別碼") };
  }
  if (key === "multiSelectOptionIds") {
    const optionIds = ids(item, "Option 識別碼");
    if (!optionIds.length) throw new ProjectError(400, "Multi-select value 不可為空。");
    return { type: "MULTI_SELECT", optionIds };
  }
  if (key === "number") {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      throw new ProjectError(400, "Field number 不正確。");
    }
    return { type: "NUMBER", number: item };
  }
  if (key === "singleSelectOptionId") {
    return { type: "SINGLE_SELECT", optionId: id(item, "Option 識別碼") };
  }
  if (key === "text") return { type: "TEXT", text: text(item, "Field text", 10_000, true) };
  throw new ProjectError(400, "Project field value 不正確。");
}

function parseCommand(raw: unknown): ProjectManagementCommand {
  const value = objectInput(raw);
  const action = value.action;

  if (action === "create-project") {
    exactKeys(value, [
      "action",
      "requestId",
      "ownerAccountId",
      "ownerKind",
      "expectedVersion",
      "title",
      "public",
      "repositoryId",
      "teamId",
    ]);
    return {
      ...requestBase(value),
      action,
      ownerAccountId: id(value.ownerAccountId, "Project owner 識別碼"),
      ownerKind: ownerKind(value.ownerKind),
      expectedVersion: expectedVersion(value.expectedVersion, true) as 0,
      title: text(value.title, "Project title", 160),
      public: bool(value.public ?? false, "Project public"),
      repositoryId:
        value.repositoryId === null || value.repositoryId === undefined
          ? null
          : id(value.repositoryId, "Repository 識別碼"),
      teamId:
        value.teamId === null || value.teamId === undefined
          ? null
          : id(value.teamId, "Team 識別碼"),
    };
  }

  if (action === "copy-project") {
    exactKeys(value, [
      "action",
      "requestId",
      "sourceProjectId",
      "sourceExpectedVersion",
      "ownerAccountId",
      "ownerKind",
      "expectedVersion",
      "title",
      "includeDraftIssues",
    ]);
    return {
      ...requestBase(value),
      action,
      sourceProjectId: id(value.sourceProjectId, "Source Project 識別碼"),
      sourceExpectedVersion: expectedVersion(value.sourceExpectedVersion),
      ownerAccountId: id(value.ownerAccountId, "Project owner 識別碼"),
      ownerKind: ownerKind(value.ownerKind),
      expectedVersion: expectedVersion(value.expectedVersion, true) as 0,
      title: text(value.title, "Project title", 160),
      includeDraftIssues: bool(value.includeDraftIssues ?? false, "includeDraftIssues"),
    };
  }

  const base = current(value);

  if (
    action === "adopt-project" ||
    action === "close-project" ||
    action === "reopen-project" ||
    action === "delete-project"
  ) {
    exactKeys(value, ["action", "requestId", "projectId", "expectedVersion"]);
    return { ...base, action };
  }

  if (action === "update-project") {
    exactKeys(value, [
      "action",
      "requestId",
      "projectId",
      "expectedVersion",
      "title",
      "shortDescription",
      "readme",
      "public",
    ]);
    const title = value.title === undefined ? undefined : text(value.title, "Project title", 160);
    const shortDescription =
      value.shortDescription === undefined
        ? undefined
        : text(value.shortDescription, "Project short description", 500, true);
    const readme =
      value.readme === undefined ? undefined : text(value.readme, "Project readme", 20_000, true);
    const publicValue =
      value.public === undefined ? undefined : bool(value.public, "Project public");
    if (
      title === undefined &&
      shortDescription === undefined &&
      readme === undefined &&
      publicValue === undefined
    ) {
      throw new ProjectError(400, "Project 修改至少需要一個欄位。");
    }
    return {
      ...base,
      action,
      ...(title === undefined ? {} : { title }),
      ...(shortDescription === undefined ? {} : { shortDescription }),
      ...(readme === undefined ? {} : { readme }),
      ...(publicValue === undefined ? {} : { public: publicValue }),
    };
  }

  if (action === "update-collaborators") {
    exactKeys(value, ["action", "requestId", "projectId", "expectedVersion", "collaborators"]);
    return { ...base, action, collaborators: collaborators(value.collaborators) };
  }

  if (action === "add-issue-item") {
    exactKeys(value, ["action", "requestId", "projectId", "expectedVersion", "issueId"]);
    return { ...base, action, issueId: id(value.issueId, "Issue 識別碼") };
  }

  if (action === "add-draft-item") {
    exactKeys(value, [
      "action",
      "requestId",
      "projectId",
      "expectedVersion",
      "title",
      "body",
      "assigneeIds",
    ]);
    return {
      ...base,
      action,
      title: text(value.title, "Draft title", 160),
      body: text(value.body ?? "", "Draft body", 20_000, true),
      assigneeIds: ids(value.assigneeIds ?? [], "Draft assignee"),
    };
  }

  if (action === "update-draft-item") {
    exactKeys(value, [
      "action",
      "requestId",
      "projectId",
      "expectedVersion",
      "itemId",
      "draftVersion",
      "title",
      "body",
      "assigneeIds",
    ]);
    const title = value.title === undefined ? undefined : text(value.title, "Draft title", 160);
    const body =
      value.body === undefined ? undefined : text(value.body, "Draft body", 20_000, true);
    const assigneeIds =
      value.assigneeIds === undefined ? undefined : ids(value.assigneeIds, "Draft assignee");
    if (title === undefined && body === undefined && assigneeIds === undefined) {
      throw new ProjectError(400, "Draft 修改至少需要一個欄位。");
    }
    return {
      ...base,
      action,
      itemId: id(value.itemId, "Project item 識別碼"),
      draftVersion: expectedVersion(value.draftVersion),
      ...(title === undefined ? {} : { title }),
      ...(body === undefined ? {} : { body }),
      ...(assigneeIds === undefined ? {} : { assigneeIds }),
    };
  }

  if (action === "archive-item" || action === "unarchive-item" || action === "delete-item") {
    exactKeys(value, [
      "action",
      "requestId",
      "projectId",
      "expectedVersion",
      "itemId",
      "itemVersion",
    ]);
    return {
      ...base,
      action,
      itemId: id(value.itemId, "Project item 識別碼"),
      itemVersion: expectedVersion(value.itemVersion),
    };
  }

  if (action === "move-item") {
    exactKeys(value, [
      "action",
      "requestId",
      "projectId",
      "expectedVersion",
      "itemId",
      "itemVersion",
      "beforeItemId",
    ]);
    return {
      ...base,
      action,
      itemId: id(value.itemId, "Project item 識別碼"),
      itemVersion: expectedVersion(value.itemVersion),
      beforeItemId:
        value.beforeItemId === null ? null : id(value.beforeItemId, "排序目標 Project item 識別碼"),
    };
  }

  if (action === "convert-draft-item") {
    exactKeys(value, [
      "action",
      "requestId",
      "projectId",
      "expectedVersion",
      "itemId",
      "itemVersion",
      "repositoryId",
    ]);
    return {
      ...base,
      action,
      itemId: id(value.itemId, "Project item 識別碼"),
      itemVersion: expectedVersion(value.itemVersion),
      repositoryId: id(value.repositoryId, "Repository 識別碼"),
    };
  }

  if (action === "create-field") {
    exactKeys(value, [
      "action",
      "requestId",
      "projectId",
      "expectedVersion",
      "name",
      "dataType",
      "options",
      "iterations",
    ]);
    if (!fieldTypes.includes(value.dataType as ProjectFieldDataType)) {
      throw new ProjectError(400, "Project field dataType 不正確。");
    }
    return {
      ...base,
      action,
      name: text(value.name, "Project field name", 120),
      dataType: value.dataType as ProjectFieldDataType,
      options: options(value.options),
      iterations: iterations(value.iterations),
    };
  }

  if (action === "update-field") {
    exactKeys(value, [
      "action",
      "requestId",
      "projectId",
      "expectedVersion",
      "fieldId",
      "fieldVersion",
      "name",
      "options",
      "iterations",
    ]);
    const name = value.name === undefined ? undefined : text(value.name, "Project field name", 120);
    const optionValues = value.options === undefined ? undefined : options(value.options);
    const iterationValues =
      value.iterations === undefined ? undefined : iterations(value.iterations);
    if (name === undefined && optionValues === undefined && iterationValues === undefined) {
      throw new ProjectError(400, "Project field 修改至少需要一個欄位。");
    }
    return {
      ...base,
      action,
      fieldId: id(value.fieldId, "Project field 識別碼"),
      fieldVersion: expectedVersion(value.fieldVersion),
      ...(name === undefined ? {} : { name }),
      ...(optionValues === undefined ? {} : { options: optionValues }),
      ...(iterationValues === undefined ? {} : { iterations: iterationValues }),
    };
  }

  if (action === "delete-field") {
    exactKeys(value, [
      "action",
      "requestId",
      "projectId",
      "expectedVersion",
      "fieldId",
      "fieldVersion",
    ]);
    return {
      ...base,
      action,
      fieldId: id(value.fieldId, "Project field 識別碼"),
      fieldVersion: expectedVersion(value.fieldVersion),
    };
  }

  if (action === "set-field-value") {
    exactKeys(value, [
      "action",
      "requestId",
      "projectId",
      "expectedVersion",
      "itemId",
      "fieldId",
      "value",
    ]);
    return {
      ...base,
      action,
      itemId: id(value.itemId, "Project item 識別碼"),
      fieldId: id(value.fieldId, "Project field 識別碼"),
      value: fieldValue(value.value),
    };
  }

  if (action === "clear-field-value") {
    exactKeys(value, ["action", "requestId", "projectId", "expectedVersion", "itemId", "fieldId"]);
    return {
      ...base,
      action,
      itemId: id(value.itemId, "Project item 識別碼"),
      fieldId: id(value.fieldId, "Project field 識別碼"),
    };
  }

  if (action === "create-view") {
    exactKeys(value, [
      "action",
      "requestId",
      "projectId",
      "expectedVersion",
      "name",
      "layout",
      "visibleFieldIds",
    ]);
    if (!layouts.includes(value.layout as ProjectViewLayout)) {
      throw new ProjectError(400, "Project view layout 不正確。");
    }
    return {
      ...base,
      action,
      name: text(value.name, "Project view name", 120),
      layout: value.layout as ProjectViewLayout,
      visibleFieldIds: ids(value.visibleFieldIds ?? [], "Project field 識別碼"),
    };
  }

  if (action === "update-view") {
    exactKeys(value, [
      "action",
      "requestId",
      "projectId",
      "expectedVersion",
      "viewId",
      "viewVersion",
      "name",
      "layout",
      "visibleFieldIds",
    ]);
    const name = value.name === undefined ? undefined : text(value.name, "Project view name", 120);
    let layout: ProjectViewLayout | undefined;
    if (value.layout !== undefined) {
      if (!layouts.includes(value.layout as ProjectViewLayout)) {
        throw new ProjectError(400, "Project view layout 不正確。");
      }
      layout = value.layout as ProjectViewLayout;
    }
    const visibleFieldIds =
      value.visibleFieldIds === undefined
        ? undefined
        : ids(value.visibleFieldIds, "Project field 識別碼");
    if (name === undefined && layout === undefined && visibleFieldIds === undefined) {
      throw new ProjectError(400, "Project view 修改至少需要一個欄位。");
    }
    return {
      ...base,
      action,
      viewId: id(value.viewId, "Project view 識別碼"),
      viewVersion: expectedVersion(value.viewVersion),
      ...(name === undefined ? {} : { name }),
      ...(layout === undefined ? {} : { layout }),
      ...(visibleFieldIds === undefined ? {} : { visibleFieldIds }),
    };
  }

  if (action === "delete-view") {
    exactKeys(value, [
      "action",
      "requestId",
      "projectId",
      "expectedVersion",
      "viewId",
      "viewVersion",
    ]);
    return {
      ...base,
      action,
      viewId: id(value.viewId, "Project view 識別碼"),
      viewVersion: expectedVersion(value.viewVersion),
    };
  }

  if (action === "create-status-update") {
    exactKeys(value, [
      "action",
      "requestId",
      "projectId",
      "expectedVersion",
      "body",
      "status",
      "startDate",
      "targetDate",
    ]);
    const status =
      value.status === null || value.status === undefined
        ? null
        : (value.status as ProjectStatusUpdateStatus);
    if (status !== null && !statuses.includes(status)) {
      throw new ProjectError(400, "Project status update status 不正確。");
    }
    return {
      ...base,
      action,
      body:
        value.body === null || value.body === undefined
          ? null
          : text(value.body, "Status update body", 20_000, true),
      status,
      startDate:
        value.startDate === null || value.startDate === undefined
          ? null
          : optionalDate(value.startDate, "Status startDate"),
      targetDate:
        value.targetDate === null || value.targetDate === undefined
          ? null
          : optionalDate(value.targetDate, "Status targetDate"),
    };
  }

  if (action === "update-status-update") {
    exactKeys(value, [
      "action",
      "requestId",
      "projectId",
      "expectedVersion",
      "statusUpdateId",
      "statusUpdateVersion",
      "body",
      "status",
      "startDate",
      "targetDate",
    ]);
    const body =
      value.body === undefined
        ? undefined
        : value.body === null
          ? null
          : text(value.body, "Status update body", 20_000, true);
    let status: ProjectStatusUpdateStatus | null | undefined;
    if (value.status !== undefined) {
      if (value.status !== null && !statuses.includes(value.status as ProjectStatusUpdateStatus)) {
        throw new ProjectError(400, "Project status update status 不正確。");
      }
      status = value.status as ProjectStatusUpdateStatus | null;
    }
    const startDate =
      value.startDate === undefined ? undefined : optionalDate(value.startDate, "Status startDate");
    const targetDate =
      value.targetDate === undefined
        ? undefined
        : optionalDate(value.targetDate, "Status targetDate");
    if (
      body === undefined &&
      status === undefined &&
      startDate === undefined &&
      targetDate === undefined
    ) {
      throw new ProjectError(400, "Project status update 修改至少需要一個欄位。");
    }
    return {
      ...base,
      action,
      statusUpdateId: id(value.statusUpdateId, "Status update 識別碼"),
      statusUpdateVersion: expectedVersion(value.statusUpdateVersion),
      ...(body === undefined ? {} : { body }),
      ...(status === undefined ? {} : { status }),
      ...(startDate === undefined ? {} : { startDate }),
      ...(targetDate === undefined ? {} : { targetDate }),
    };
  }

  if (action === "delete-status-update") {
    exactKeys(value, [
      "action",
      "requestId",
      "projectId",
      "expectedVersion",
      "statusUpdateId",
      "statusUpdateVersion",
    ]);
    return {
      ...base,
      action,
      statusUpdateId: id(value.statusUpdateId, "Status update 識別碼"),
      statusUpdateVersion: expectedVersion(value.statusUpdateVersion),
    };
  }

  throw new ProjectError(400, "Project 操作不正確。");
}

export function createProjectManagement(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): ProjectManagementStore;
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
    command: async (subject: string, raw: unknown) =>
      deps.store().execute(await identity(subject), parseCommand(raw), deps.now()),
  };
}
