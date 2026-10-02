import { randomUUID } from "node:crypto";
import type { Sql } from "@line_bot_v1/platform/postgres";
import type {
  ProjectManagementCommand,
  ProjectStatusUpdate,
  ProjectView,
} from "../../../contracts/management.js";
import type {
  ProjectStatusUpdateStatus,
  ProjectViewLayout,
} from "../../../domain.js";
import { ProjectError } from "../../../domain.js";

type ViewRow = {
  id: string;
  project_id: string;
  number: number | string;
  name: string;
  layout: ProjectViewLayout;
  version: number | string;
  created_at: number | string;
  updated_at: number | string;
};

type StatusRow = {
  id: string;
  project_id: string;
  author: string;
  body: string | null;
  status: ProjectStatusUpdateStatus | null;
  start_date: string | null;
  target_date: string | null;
  deleted_at: number | string | null;
  version: number | string;
  created_at: number | string;
  updated_at: number | string;
};

async function visibleFields(sql: Sql, viewIds: readonly string[]) {
  const result = new Map<string, string[]>();
  if (!viewIds.length) return result;
  const rows = (
    await sql.query(
      `SELECT view_id,field_id
       FROM project_view_visible_fields
       WHERE view_id=ANY($1::text[])
       ORDER BY view_id,position,field_id`,
      [viewIds],
    )
  ).rows as Array<{ view_id: string; field_id: string }>;
  for (const row of rows) {
    const values = result.get(row.view_id) ?? [];
    values.push(row.field_id);
    result.set(row.view_id, values);
  }
  return result;
}

export async function readProjectViews(sql: Sql, projectId: string): Promise<ProjectView[]> {
  const rows = (
    await sql.query(
      `SELECT *
       FROM project_views
       WHERE project_id=$1
       ORDER BY number,id`,
      [projectId],
    )
  ).rows as ViewRow[];
  const fields = await visibleFields(
    sql,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    number: Number(row.number),
    name: row.name,
    layout: row.layout,
    visibleFieldIds: fields.get(row.id) ?? [],
    version: Number(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }));
}

export async function readProjectStatusUpdates(
  sql: Sql,
  projectId: string,
): Promise<ProjectStatusUpdate[]> {
  const rows = (
    await sql.query(
      `SELECT *
       FROM project_status_updates
       WHERE project_id=$1 AND deleted_at IS NULL
       ORDER BY created_at DESC,id`,
      [projectId],
    )
  ).rows as StatusRow[];
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    author: row.author,
    body: row.body,
    status: row.status,
    startDate: row.start_date,
    targetDate: row.target_date,
    version: Number(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }));
}

async function requireFieldIds(
  sql: Sql,
  projectId: string,
  fieldIds: readonly string[],
) {
  if (!fieldIds.length) return;
  const rows = (
    await sql.query(
      `SELECT id
       FROM project_fields
       WHERE project_id=$1 AND id=ANY($2::text[])`,
      [projectId, fieldIds],
    )
  ).rows as Array<{ id: string }>;
  if (rows.length !== new Set(fieldIds).size) {
    throw new ProjectError(409, "Project view visible fields 必須屬於同一 Project。");
  }
}

async function replaceVisibleFields(
  sql: Sql,
  projectId: string,
  viewId: string,
  fieldIds: readonly string[],
) {
  await requireFieldIds(sql, projectId, fieldIds);
  await sql.query("DELETE FROM project_view_visible_fields WHERE view_id=$1", [viewId]);
  for (let index = 0; index < fieldIds.length; index += 1) {
    await sql.query(
      `INSERT INTO project_view_visible_fields(project_id,view_id,field_id,position)
       VALUES($1,$2,$3,$4)`,
      [projectId, viewId, fieldIds[index], index],
    );
  }
}

async function nextViewNumber(sql: Sql, projectId: string): Promise<number> {
  const row = (
    await sql.query(
      "SELECT COALESCE(MAX(number),0)+1 AS number FROM project_views WHERE project_id=$1",
      [projectId],
    )
  ).rows[0] as { number: number | string };
  return Number(row.number);
}

async function currentView(sql: Sql, projectId: string, viewId: string): Promise<ViewRow> {
  const row = (
    await sql.query(
      `SELECT *
       FROM project_views
       WHERE project_id=$1 AND id=$2
       FOR UPDATE`,
      [projectId, viewId],
    )
  ).rows[0] as ViewRow | undefined;
  if (!row) throw new ProjectError(404, "找不到 Project view。");
  return row;
}

async function currentStatus(
  sql: Sql,
  projectId: string,
  statusUpdateId: string,
): Promise<StatusRow> {
  const row = (
    await sql.query(
      `SELECT *
       FROM project_status_updates
       WHERE project_id=$1 AND id=$2
       FOR UPDATE`,
      [projectId, statusUpdateId],
    )
  ).rows[0] as StatusRow | undefined;
  if (!row || row.deleted_at !== null) throw new ProjectError(404, "找不到 Project status update。");
  return row;
}

function requireChildVersion(actual: number | string, expected: number, label: string) {
  if (Number(actual) !== expected) {
    throw new ProjectError(409, `${label}已更新，請重新讀取後再操作。`);
  }
}

export async function executeProjectViewStatusCommand(
  sql: Sql,
  userId: string,
  projectId: string,
  command: ProjectManagementCommand,
  now: number,
): Promise<{ resourceId: string | null; data: Record<string, unknown> }> {
  if (command.action === "create-view") {
    await requireFieldIds(sql, projectId, command.visibleFieldIds);
    const viewId = randomUUID();
    const number = await nextViewNumber(sql, projectId);
    await sql.query(
      `INSERT INTO project_views(
         id,project_id,number,name,layout,version,created_at,updated_at
       ) VALUES($1,$2,$3,$4,$5,1,$6,$6)`,
      [viewId, projectId, number, command.name, command.layout, now],
    );
    await replaceVisibleFields(sql, projectId, viewId, command.visibleFieldIds);
    return {
      resourceId: viewId,
      data: {
        viewId,
        number,
        name: command.name,
        layout: command.layout,
        visibleFieldIds: command.visibleFieldIds,
      },
    };
  }

  if (command.action === "update-view") {
    const before = await currentView(sql, projectId, command.viewId);
    requireChildVersion(before.version, command.viewVersion, "Project view");
    const fields =
      command.visibleFieldIds === undefined
        ? (await visibleFields(sql, [before.id])).get(before.id) ?? []
        : command.visibleFieldIds;
    if (command.visibleFieldIds !== undefined) {
      await requireFieldIds(sql, projectId, fields);
    }
    const name = command.name ?? before.name;
    const layout = command.layout ?? before.layout;
    const currentFields = (await visibleFields(sql, [before.id])).get(before.id) ?? [];
    if (
      name === before.name &&
      layout === before.layout &&
      JSON.stringify(fields) === JSON.stringify(currentFields)
    ) {
      throw new ProjectError(409, "Project view 沒有變更。");
    }
    const updated = (
      await sql.query(
        `UPDATE project_views
         SET name=$3,layout=$4,version=version+1,updated_at=$5
         WHERE project_id=$1 AND id=$2 AND version=$6
         RETURNING version`,
        [projectId, before.id, name, layout, now, command.viewVersion],
      )
    ).rows[0] as { version: number | string } | undefined;
    if (!updated) throw new ProjectError(409, "Project view 已更新。");
    if (command.visibleFieldIds !== undefined) {
      await replaceVisibleFields(sql, projectId, before.id, fields);
    }
    return {
      resourceId: before.id,
      data: {
        viewId: before.id,
        viewVersion: Number(updated.version),
        name,
        layout,
        visibleFieldIds: fields,
      },
    };
  }

  if (command.action === "delete-view") {
    const before = await currentView(sql, projectId, command.viewId);
    requireChildVersion(before.version, command.viewVersion, "Project view");
    await sql.query("DELETE FROM project_view_visible_fields WHERE view_id=$1", [before.id]);
    await sql.query(
      "DELETE FROM project_views WHERE project_id=$1 AND id=$2 AND version=$3",
      [projectId, before.id, command.viewVersion],
    );
    return { resourceId: before.id, data: { viewId: before.id, deleted: true } };
  }

  if (command.action === "create-status-update") {
    const statusUpdateId = randomUUID();
    await sql.query(
      `INSERT INTO project_status_updates(
         id,project_id,author,body,status,start_date,target_date,
         deleted_at,version,created_at,updated_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7,NULL,1,$8,$8)`,
      [
        statusUpdateId,
        projectId,
        userId,
        command.body,
        command.status,
        command.startDate,
        command.targetDate,
        now,
      ],
    );
    return {
      resourceId: statusUpdateId,
      data: {
        statusUpdateId,
        status: command.status,
        startDate: command.startDate,
        targetDate: command.targetDate,
      },
    };
  }

  if (command.action === "update-status-update") {
    const before = await currentStatus(sql, projectId, command.statusUpdateId);
    requireChildVersion(before.version, command.statusUpdateVersion, "Project status update");
    const body = command.body === undefined ? before.body : command.body;
    const status = command.status === undefined ? before.status : command.status;
    const startDate = command.startDate === undefined ? before.start_date : command.startDate;
    const targetDate = command.targetDate === undefined ? before.target_date : command.targetDate;
    if (
      body === before.body &&
      status === before.status &&
      startDate === before.start_date &&
      targetDate === before.target_date
    ) {
      throw new ProjectError(409, "Project status update 沒有變更。");
    }
    const updated = (
      await sql.query(
        `UPDATE project_status_updates
         SET body=$3,status=$4,start_date=$5,target_date=$6,
             version=version+1,updated_at=$7
         WHERE project_id=$1 AND id=$2 AND version=$8 AND deleted_at IS NULL
         RETURNING version`,
        [
          projectId,
          before.id,
          body,
          status,
          startDate,
          targetDate,
          now,
          command.statusUpdateVersion,
        ],
      )
    ).rows[0] as { version: number | string } | undefined;
    if (!updated) throw new ProjectError(409, "Project status update 已更新。");
    return {
      resourceId: before.id,
      data: {
        statusUpdateId: before.id,
        statusUpdateVersion: Number(updated.version),
        status,
        startDate,
        targetDate,
      },
    };
  }

  if (command.action === "delete-status-update") {
    const before = await currentStatus(sql, projectId, command.statusUpdateId);
    requireChildVersion(before.version, command.statusUpdateVersion, "Project status update");
    const updated = (
      await sql.query(
        `UPDATE project_status_updates
         SET body=NULL,status=NULL,start_date=NULL,target_date=NULL,
             deleted_at=$3,version=version+1,updated_at=$3
         WHERE project_id=$1 AND id=$2 AND version=$4 AND deleted_at IS NULL
         RETURNING version`,
        [projectId, before.id, now, command.statusUpdateVersion],
      )
    ).rows[0] as { version: number | string } | undefined;
    if (!updated) throw new ProjectError(409, "Project status update 已更新。");
    return {
      resourceId: before.id,
      data: {
        statusUpdateId: before.id,
        deleted: true,
        statusUpdateVersion: Number(updated.version),
      },
    };
  }

  throw new ProjectError(400, "不是 Project view/status update 操作。");
}
