import { createHash } from "node:crypto";
import { readOrganizationOwnerScopeIds } from "@line_bot_v1/organization/postgres";
import type { Sql } from "@line_bot_v1/platform/postgres";
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

const roleRank: Readonly<Record<ProjectAccessRole, number>> = {
  READ: 1,
  WRITE: 2,
  ADMIN: 3,
};

export const projectFingerprint = (command: ProjectManagementCommand) =>
  createHash("sha256")
    .update(JSON.stringify({ family: "project-management", command }))
    .digest("hex");

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

async function effectiveProjectRole(
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
    const organizationOwnerIds = await readOrganizationOwnerScopeIds(sql, userId);
    if (organizationOwnerIds.includes(row.owner_account_id)) roles.push("ADMIN");
  }

  const direct = (
    await sql.query("SELECT role FROM project_user_access WHERE project_id=$1 AND user_id=$2", [
      row.id,
      userId,
    ])
  ).rows[0] as { role: ProjectAccessRole } | undefined;
  if (direct) roles.push(direct.role);

  const teamIds = await readActiveProjectTeamIds(sql, userId);
  if (teamIds.length) {
    const teamRoles = (
      await sql.query(
        `SELECT role
         FROM project_team_access
         WHERE project_id=$1 AND team_id=ANY($2::text[])`,
        [row.id, teamIds],
      )
    ).rows as Array<{ role: ProjectAccessRole }>;
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
  const row = (await sql.query("SELECT * FROM projects WHERE id=$1", [projectId])).rows[0] as
    | ProjectRow
    | undefined;
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
  const row = (await sql.query("SELECT * FROM projects WHERE id=$1 FOR UPDATE", [projectId]))
    .rows[0] as ProjectRow | undefined;
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
) {
  if (ownerKind === "USER") {
    if (ownerAccountId !== userId) {
      throw new ProjectError(403, "只能在自己的 User owner scope 建立 Project。");
    }
    return;
  }
  const organizationOwnerIds = await readOrganizationOwnerScopeIds(sql, userId);
  if (!organizationOwnerIds.includes(ownerAccountId)) {
    throw new ProjectError(403, "需要目前 OrganizationOwner 才能在此 scope 建立 Project。");
  }
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

export async function allocateProjectNumber(
  sql: Sql,
  ownerAccountId: string,
  ownerKind: ProjectOwnerKind,
): Promise<number> {
  await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `project-number:${ownerKind}:${ownerAccountId}`,
  ]);
  const row = (
    await sql.query(
      `SELECT COALESCE(MAX(number),0)+1 AS number
       FROM projects
       WHERE owner_account_id=$1 AND owner_account_kind=$2`,
      [ownerAccountId, ownerKind],
    )
  ).rows[0] as { number: number | string };
  return Number(row.number);
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
    )
  ).rows[0] as ProjectRow | undefined;
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
    )
  ).rows[0] as { fingerprint: string; result: unknown } | undefined;
  if (!previous) return null;
  if (previous.fingerprint !== fingerprint) {
    throw new ProjectError(409, "此請求編號已用於不同 Project 操作。");
  }
  if (!record(previous.result)) throw new ProjectError(503, "Project 回執無法讀取。");
  const envelope = previous.result as Partial<StoredReceipt>;
  const result = envelope.result;
  if (
    envelope.receiptVersion !== 1 ||
    envelope.family !== "project-management" ||
    !record(result) ||
    typeof result.requestId !== "string" ||
    typeof result.action !== "string" ||
    typeof result.projectId !== "string" ||
    !Number.isSafeInteger(result.version) ||
    !Number.isSafeInteger(result.at)
  ) {
    throw new ProjectError(503, "Project 回執無法讀取。");
  }
  return result as ProjectManagementReceipt;
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
