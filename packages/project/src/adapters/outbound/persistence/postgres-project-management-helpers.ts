import { createHash } from "node:crypto";
import { readOrganizationViewerCapabilities } from "@line_bot_v1/organization/postgres";
import type { Sql, SqlRow } from "@line_bot_v1/platform/postgres";
import {
  booleanValue,
  isRecord,
  literalValue,
  nullableNumericValue,
  nullableString,
  numericValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import {
  readActiveProjectTeamIds,
  readProjectTeamOrganization,
} from "@line_bot_v1/team/postgres/project-access";
import type {
  ProjectManagementCommand,
  ProjectManagementReceipt,
  ProjectRoot,
} from "../../../contracts/management.js";
import type { ProjectAccessRole, ProjectOwnerKind } from "../../../domain.js";
import { ProjectError } from "../../../domain.js";

export type ProjectRow = {
  id: string;
  owner_account_id: string;
  owner_account_kind: ProjectOwnerKind;
  number: number | string | null;
  creator: string | null;
  name: string;
  short_description: string;
  readme: string;
  is_public: boolean;
  closed: boolean;
  closed_at: number | string | null;
  deleted_at: number | string | null;
  version: number | string;
  created_at: number | string;
  updated_at: number | string;
};

type StoredReceipt = Readonly<{
  receiptVersion: 1;
  family: "project-management";
  result: ProjectManagementReceipt;
}>;

const projectManagementActions: readonly ProjectManagementCommand["action"][] = [
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

const roleRank: Readonly<Record<ProjectAccessRole, number>> = {
  READ: 1,
  WRITE: 2,
  ADMIN: 3,
};

const projectAccessRoles: readonly ProjectAccessRole[] = ["READ", "WRITE", "ADMIN"];
const projectOwnerKinds: readonly ProjectOwnerKind[] = ["USER", "ORGANIZATION"];

const roleRow = (row: SqlRow): { role: ProjectAccessRole } => ({
  role: literalValue(row.role, projectAccessRoles),
});

const receiptRow = (row: SqlRow): { fingerprint: string; result: unknown } => ({
  fingerprint: stringValue(row.fingerprint),
  result: row.result,
});

export function decodeProjectRow(row: SqlRow): ProjectRow {
  return {
    id: stringValue(row.id),
    owner_account_id: stringValue(row.owner_account_id),
    owner_account_kind: literalValue(row.owner_account_kind, projectOwnerKinds),
    number: nullableNumericValue(row.number),
    creator: nullableString(row.creator),
    name: stringValue(row.name),
    short_description: stringValue(row.short_description),
    readme: stringValue(row.readme),
    is_public: booleanValue(row.is_public),
    closed: booleanValue(row.closed),
    closed_at: nullableNumericValue(row.closed_at),
    deleted_at: nullableNumericValue(row.deleted_at),
    version: numericValue(row.version),
    created_at: numericValue(row.created_at),
    updated_at: numericValue(row.updated_at),
  };
}

export const projectFingerprint = (command: ProjectManagementCommand) =>
  createHash("sha256")
    .update(JSON.stringify({ family: "project-management", command }))
    .digest("hex");

function projectManagementAction(value: unknown): ProjectManagementCommand["action"] | null {
  for (const action of projectManagementActions) {
    if (value === action) return action;
  }
  return null;
}

export function projectRoot(row: ProjectRow): ProjectRoot {
  return {
    id: row.id,
    ownerAccountId: row.owner_account_id,
    ownerKind: row.owner_account_kind,
    number: row.number === null ? null : Number(row.number),
    creator: row.creator,
    title: row.name,
    shortDescription: row.short_description,
    readme: row.readme,
    public: row.is_public,
    closed: row.closed,
    closedAt: row.closed_at === null ? null : Number(row.closed_at),
    deleted: row.deleted_at !== null,
    version: Number(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function highestRole(values: readonly ProjectAccessRole[]): ProjectAccessRole | null {
  let best: ProjectAccessRole | null = null;
  for (const value of values) {
    if (best === null || roleRank[value] > roleRank[best]) best = value;
  }
  return best;
}

export async function effectiveProjectRole(
  sql: Sql,
  row: ProjectRow,
  userId: string,
): Promise<ProjectAccessRole | null> {
  const roles: ProjectAccessRole[] = [];
  if (row.is_public && row.deleted_at === null) roles.push("READ");

  if (row.owner_account_kind === "USER" && row.owner_account_id === userId) {
    roles.push("ADMIN");
  }
  if (row.owner_account_kind === "ORGANIZATION") {
    const capabilities = await readOrganizationViewerCapabilities(
      sql,
      userId,
      row.owner_account_id,
    );
    if (capabilities?.viewerCanAdminister) roles.push("ADMIN");
  }

  const direct = (
    await sql.query(
      "SELECT role FROM project_user_access WHERE project_id=$1 AND user_id=$2",
      [row.id, userId],
      roleRow,
    )
  ).rows[0];
  if (direct) roles.push(direct.role);

  const teamIds = await readActiveProjectTeamIds(sql, userId);
  if (teamIds.length) {
    const teamRoles = (
      await sql.query(
        `SELECT role
         FROM project_team_access
         WHERE project_id=$1 AND team_id=ANY($2::text[])`,
        [row.id, teamIds],
        roleRow,
      )
    ).rows;
    roles.push(...teamRoles.map((item) => item.role));
  }

  return highestRole(roles);
}

export async function readProjectScope(
  sql: Sql,
  userId: string,
  projectId: string,
  includeDeleted = false,
): Promise<{ row: ProjectRow; role: ProjectAccessRole }> {
  const row = (await sql.query("SELECT * FROM projects WHERE id=$1", [projectId], decodeProjectRow))
    .rows[0];
  if (!row || (!includeDeleted && row.deleted_at !== null)) {
    throw new ProjectError(404, "找不到 Project。");
  }
  const role = await effectiveProjectRole(sql, row, userId);
  if (!role) throw new ProjectError(404, "找不到可存取的 Project。");
  return { row, role };
}

export async function lockProjectScope(
  sql: Sql,
  userId: string,
  projectId: string,
  includeDeleted = false,
): Promise<{ row: ProjectRow; role: ProjectAccessRole }> {
  await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`project:${projectId}`]);
  const row = (
    await sql.query("SELECT * FROM projects WHERE id=$1 FOR UPDATE", [projectId], decodeProjectRow)
  ).rows[0];
  if (!row || (!includeDeleted && row.deleted_at !== null)) {
    throw new ProjectError(404, "找不到 Project。");
  }
  const role = await effectiveProjectRole(sql, row, userId);
  if (!role) throw new ProjectError(404, "找不到可存取的 Project。");
  return { row, role };
}

export function requireProjectRole(actual: ProjectAccessRole, required: ProjectAccessRole) {
  if (roleRank[actual] < roleRank[required]) {
    throw new ProjectError(403, "目前 Project access 不允許此操作。");
  }
}

export function requireProjectVersion(row: ProjectRow, expectedVersion: number) {
  if (Number(row.version) !== expectedVersion) {
    throw new ProjectError(409, "Project 已更新，請重新讀取後再操作。");
  }
}

export async function requireProjectOwnerTarget(
  sql: Sql,
  userId: string,
  ownerAccountId: string,
  ownerKind: ProjectOwnerKind,
): Promise<boolean> {
  if (ownerKind === "USER") {
    if (ownerAccountId !== userId) {
      throw new ProjectError(403, "只能在自己的 User owner scope 建立 Project。");
    }
    return true;
  }
  const capabilities = await readOrganizationViewerCapabilities(sql, userId, ownerAccountId);
  if (!capabilities?.viewerCanCreateProjectV2) {
    throw new ProjectError(403, "目前 Organization capability 不允許建立 Project。");
  }
  return capabilities.viewerCanAdminister;
}

export async function requireProjectTeamTarget(
  sql: Sql,
  ownerAccountId: string,
  ownerKind: ProjectOwnerKind,
  teamId: string,
) {
  const organizationAccountId = await readProjectTeamOrganization(sql, teamId);
  if (!organizationAccountId) throw new ProjectError(404, "找不到 Team collaborator。");
  if (ownerKind !== "ORGANIZATION" || organizationAccountId !== ownerAccountId) {
    throw new ProjectError(409, "Team collaborator 必須屬於 Project owner Organization。");
  }
}

export async function advanceProject(
  sql: Sql,
  row: ProjectRow,
  expectedVersion: number,
  now: number,
  patch: Partial<{
    number: number;
    title: string;
    shortDescription: string;
    readme: string;
    public: boolean;
    closed: boolean;
    closedAt: number | null;
    deletedAt: number | null;
  }> = {},
): Promise<ProjectRow> {
  const updated = (
    await sql.query(
      `UPDATE projects
       SET number=$3,
           name=$4,
           short_description=$5,
           readme=$6,
           is_public=$7,
           closed=$8,
           closed_at=$9,
           deleted_at=$10,
           version=version+1,
           updated_at=$11
       WHERE id=$1 AND version=$2
       RETURNING *`,
      [
        row.id,
        expectedVersion,
        patch.number ?? row.number,
        patch.title ?? row.name,
        patch.shortDescription ?? row.short_description,
        patch.readme ?? row.readme,
        patch.public ?? row.is_public,
        patch.closed ?? row.closed,
        "closedAt" in patch ? patch.closedAt : row.closed_at,
        "deletedAt" in patch ? patch.deletedAt : row.deleted_at,
        now,
      ],
      decodeProjectRow,
    )
  ).rows[0];
  if (!updated) throw new ProjectError(409, "Project 已更新，請重新讀取後再操作。");
  return updated;
}

export async function appendProjectEvent(
  sql: Sql,
  projectId: string,
  version: number,
  actor: string,
  action: string,
  data: Readonly<Record<string, unknown>>,
  now: number,
) {
  await sql.query(
    `INSERT INTO project_events(project_id,version,actor,action,data,at)
     VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
    [projectId, version, actor, action, JSON.stringify(data), now],
  );
}

export async function readProjectReceipt(
  sql: Sql,
  userId: string,
  requestId: string,
  fingerprint: string,
): Promise<ProjectManagementReceipt | null> {
  const previous = (
    await sql.query(
      "SELECT fingerprint,result FROM project_commands WHERE actor=$1 AND request_id=$2",
      [userId, requestId],
      receiptRow,
    )
  ).rows[0];
  if (!previous) return null;
  if (previous.fingerprint !== fingerprint) {
    throw new ProjectError(409, "此請求編號已用於不同 Project 操作。");
  }
  if (!isRecord(previous.result)) throw new ProjectError(503, "Project 回執無法讀取。");
  const envelope = previous.result;
  const result = envelope.result;
  const action = isRecord(result) ? projectManagementAction(result.action) : null;
  if (
    envelope.receiptVersion !== 1 ||
    envelope.family !== "project-management" ||
    !isRecord(result) ||
    typeof result.requestId !== "string" ||
    action === null ||
    typeof result.projectId !== "string" ||
    (result.resourceId !== null && typeof result.resourceId !== "string") ||
    !Number.isSafeInteger(result.version) ||
    !Number.isSafeInteger(result.at) ||
    !isRecord(result.data)
  ) {
    throw new ProjectError(503, "Project 回執無法讀取。");
  }
  return {
    requestId: result.requestId,
    action,
    projectId: result.projectId,
    resourceId: result.resourceId,
    version: Number(result.version),
    at: Number(result.at),
    data: result.data,
  };
}

export async function storeProjectReceipt(
  sql: Sql,
  userId: string,
  fingerprint: string,
  result: ProjectManagementReceipt,
  now: number,
) {
  const envelope: StoredReceipt = {
    receiptVersion: 1,
    family: "project-management",
    result,
  };
  await sql.query(
    `INSERT INTO project_commands(actor,request_id,fingerprint,result,created_at)
     VALUES($1,$2,$3,$4::jsonb,$5)`,
    [userId, result.requestId, fingerprint, JSON.stringify(envelope), now],
  );
}
