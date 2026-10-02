import { randomUUID } from "node:crypto";
import {
  createIssueFromProjectDraft,
  readProjectIssueReference,
} from "@line_bot_v1/issue/postgres/project-reference";
import type { Sql } from "@line_bot_v1/platform/postgres";
import type {
  ProjectDraftIssue,
  ProjectItem,
  ProjectManagementCommand,
} from "../../../contracts/management.js";
import { ProjectError } from "../../../domain.js";

type ItemRow = {
  id: string;
  project_id: string;
  repository_id: string | null;
  issue_id: string | null;
  draft_issue_id: string | null;
  source_version: number | string | null;
  position: number | string;
  archived: boolean;
  version: number | string;
  created_at: number | string;
  updated_at: number | string;
};

type DraftRow = {
  id: string;
  project_id: string;
  creator: string;
  title: string;
  body: string;
  deleted_at: number | string | null;
  version: number | string;
  created_at: number | string;
  updated_at: number | string;
};

function postgresConflict(error: unknown, message: string): never {
  const postgres = error as { code?: string };
  if (postgres.code === "23503" || postgres.code === "23505" || postgres.code === "23514") {
    throw new ProjectError(409, message);
  }
  throw error;
}

async function draftAssignees(sql: Sql, draftIssueId: string): Promise<string[]> {
  const rows = (
    await sql.query(
      `SELECT user_id
       FROM project_draft_issue_assignees
       WHERE draft_issue_id=$1
       ORDER BY user_id`,
      [draftIssueId],
    )
  ).rows as Array<{ user_id: string }>;
  return rows.map((row) => row.user_id);
}

function draft(row: DraftRow, assigneeIds: readonly string[]): ProjectDraftIssue {
  const deleted = row.deleted_at !== null;
  return {
    id: row.id,
    title: deleted ? null : row.title,
    body: deleted ? null : row.body,
    assigneeIds,
    deleted,
    version: Number(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

async function readDraft(sql: Sql, projectId: string, draftIssueId: string): Promise<DraftRow> {
  const row = (
    await sql.query(
      `SELECT *
       FROM project_draft_issues
       WHERE project_id=$1 AND id=$2`,
      [projectId, draftIssueId],
    )
  ).rows[0] as DraftRow | undefined;
  if (!row) throw new ProjectError(503, "Project DraftIssue reference 無法讀取。");
  return row;
}

async function currentItem(sql: Sql, projectId: string, itemId: string): Promise<ItemRow> {
  const row = (
    await sql.query(
      `SELECT *
       FROM project_items
       WHERE project_id=$1 AND id=$2
       FOR UPDATE`,
      [projectId, itemId],
    )
  ).rows[0] as ItemRow | undefined;
  if (!row) throw new ProjectError(404, "找不到 Project item。");
  return row;
}

function requireItemVersion(row: ItemRow, expectedVersion: number) {
  if (Number(row.version) !== expectedVersion) {
    throw new ProjectError(409, "Project item 已更新，請重新讀取後再操作。");
  }
}

async function nextPosition(sql: Sql, projectId: string): Promise<number> {
  const row = (
    await sql.query(
      `SELECT COALESCE(MAX(position),-1)+1 AS position
       FROM project_items
       WHERE project_id=$1`,
      [projectId],
    )
  ).rows[0] as { position: number | string };
  return Number(row.position);
}

async function ensureRepositoryReference(sql: Sql, projectId: string, repositoryId: string) {
  const existing = (
    await sql.query(
      `SELECT 1
       FROM project_repository_references
       WHERE project_id=$1 AND repository_id=$2`,
      [projectId, repositoryId],
    )
  ).rows[0];
  if (existing) return;
  const row = (
    await sql.query(
      `SELECT COALESCE(MAX(position),-1)+1 AS position
       FROM project_repository_references
       WHERE project_id=$1`,
      [projectId],
    )
  ).rows[0] as { position: number | string };
  await sql.query(
    `INSERT INTO project_repository_references(
       project_id,repository_id,position,version
     ) VALUES($1,$2,$3,1)`,
    [projectId, repositoryId, Number(row.position)],
  );
}

export async function readProjectItems(
  sql: Sql,
  userId: string,
  projectId: string,
): Promise<ProjectItem[]> {
  const rows = (
    await sql.query(
      `SELECT *
       FROM project_items
       WHERE project_id=$1
       ORDER BY position,id`,
      [projectId],
    )
  ).rows as ItemRow[];
  const result: ProjectItem[] = [];
  for (const row of rows) {
    if (row.issue_id !== null) {
      const issue = await readProjectIssueReference(sql, userId, row.issue_id);
      if (!issue) continue;
      result.push({
        id: row.id,
        projectId: row.project_id,
        kind: "ISSUE",
        archived: row.archived,
        position: Number(row.position),
        version: Number(row.version),
        issue,
        draft: null,
      });
      continue;
    }
    if (!row.draft_issue_id) {
      throw new ProjectError(503, "Project item content variant 無法讀取。");
    }
    const draftRow = await readDraft(sql, projectId, row.draft_issue_id);
    const assigneeIds = await draftAssignees(sql, draftRow.id);
    result.push({
      id: row.id,
      projectId: row.project_id,
      kind: "DRAFT_ISSUE",
      archived: row.archived,
      position: Number(row.position),
      version: Number(row.version),
      issue: null,
      draft: draft(draftRow, assigneeIds),
    });
  }
  return result;
}

export async function executeProjectItemCommand(
  sql: Sql,
  userId: string,
  projectId: string,
  command: ProjectManagementCommand,
  now: number,
): Promise<{ resourceId: string | null; data: Record<string, unknown> }> {
  if (command.action === "add-issue-item") {
    const issue = await readProjectIssueReference(sql, userId, command.issueId);
    if (!issue) throw new ProjectError(404, "找不到可讀取的 source Issue。");
    const itemId = randomUUID();
    const position = await nextPosition(sql, projectId);
    try {
      await sql.query(
        `INSERT INTO project_items(
           id,project_id,repository_id,issue_id,draft_issue_id,source_version,
           position,archived,version,created_at,updated_at
         ) VALUES($1,$2,$3,$4,NULL,$5,$6,false,1,$7,$7)`,
        [itemId, projectId, issue.repositoryId, issue.id, issue.version, position, now],
      );
    } catch (error) {
      postgresConflict(error, "此 Issue 已存在於 Project 或 Item 關係不合法。");
    }
    await ensureRepositoryReference(sql, projectId, issue.repositoryId);
    return {
      resourceId: itemId,
      data: { itemId, kind: "ISSUE", issueId: issue.id, position },
    };
  }

  if (command.action === "add-draft-item") {
    const itemId = randomUUID();
    const draftIssueId = randomUUID();
    const position = await nextPosition(sql, projectId);
    try {
      await sql.query(
        `INSERT INTO project_draft_issues(
           id,project_id,creator,title,body,deleted_at,
           version,created_at,updated_at
         ) VALUES($1,$2,$3,$4,$5,NULL,1,$6,$6)`,
        [draftIssueId, projectId, userId, command.title, command.body, now],
      );
      await sql.query(
        `INSERT INTO project_items(
           id,project_id,repository_id,issue_id,draft_issue_id,source_version,
           position,archived,version,created_at,updated_at
         ) VALUES($1,$2,NULL,NULL,$3,NULL,$4,false,1,$5,$5)`,
        [itemId, projectId, draftIssueId, position, now],
      );
      if (command.assigneeIds.length) {
        await sql.query(
          `INSERT INTO project_draft_issue_assignees(draft_issue_id,user_id,added_at)
           SELECT $1,user_id,$3
           FROM unnest($2::text[]) AS user_id`,
          [draftIssueId, command.assigneeIds, now],
        );
      }
    } catch (error) {
      postgresConflict(error, "DraftIssue assignee 或 Item 關係不合法。");
    }
    return {
      resourceId: itemId,
      data: { itemId, draftIssueId, kind: "DRAFT_ISSUE", position },
    };
  }

  if (command.action === "update-draft-item") {
    const item = await currentItem(sql, projectId, command.itemId);
    if (!item.draft_issue_id) throw new ProjectError(409, "此 Item 不是 DraftIssue。");
    const draftRow = (
      await sql.query(
        `SELECT *
         FROM project_draft_issues
         WHERE project_id=$1 AND id=$2
         FOR UPDATE`,
        [projectId, item.draft_issue_id],
      )
    ).rows[0] as DraftRow | undefined;
    if (!draftRow || draftRow.deleted_at !== null) {
      throw new ProjectError(409, "DraftIssue 已刪除或無法更新。");
    }
    if (Number(draftRow.version) !== command.draftVersion) {
      throw new ProjectError(409, "DraftIssue 已更新，請重新讀取後再操作。");
    }
    const currentAssignees = await draftAssignees(sql, draftRow.id);
    const title = command.title ?? draftRow.title;
    const body = command.body ?? draftRow.body;
    const assigneeIds = command.assigneeIds ?? currentAssignees;
    if (
      title === draftRow.title &&
      body === draftRow.body &&
      JSON.stringify(assigneeIds) === JSON.stringify(currentAssignees)
    ) {
      throw new ProjectError(409, "DraftIssue 沒有變更。");
    }
    try {
      await sql.query(
        `UPDATE project_draft_issues
         SET title=$3,body=$4,version=version+1,updated_at=$5
         WHERE project_id=$1 AND id=$2 AND version=$6`,
        [projectId, draftRow.id, title, body, now, command.draftVersion],
      );
      if (command.assigneeIds !== undefined) {
        await sql.query("DELETE FROM project_draft_issue_assignees WHERE draft_issue_id=$1", [
          draftRow.id,
        ]);
        if (command.assigneeIds.length) {
          await sql.query(
            `INSERT INTO project_draft_issue_assignees(draft_issue_id,user_id,added_at)
             SELECT $1,user_id,$3
             FROM unnest($2::text[]) AS user_id`,
            [draftRow.id, command.assigneeIds, now],
          );
        }
      }
    } catch (error) {
      postgresConflict(error, "DraftIssue assignee 不合法。");
    }
    return {
      resourceId: item.id,
      data: { itemId: item.id, draftIssueId: draftRow.id, draftVersion: command.draftVersion + 1 },
    };
  }

  if (
    command.action === "archive-item" ||
    command.action === "unarchive-item" ||
    command.action === "delete-item"
  ) {
    const item = await currentItem(sql, projectId, command.itemId);
    requireItemVersion(item, command.itemVersion);
    if (command.action === "delete-item") {
      await sql.query(
        "DELETE FROM project_item_multi_select_values WHERE project_id=$1 AND item_id=$2",
        [projectId, item.id],
      );
      await sql.query("DELETE FROM project_item_field_values WHERE project_id=$1 AND item_id=$2", [
        projectId,
        item.id,
      ]);
      await sql.query("DELETE FROM project_items WHERE project_id=$1 AND id=$2 AND version=$3", [
        projectId,
        item.id,
        command.itemVersion,
      ]);
      if (item.draft_issue_id) {
        await sql.query("DELETE FROM project_draft_issue_assignees WHERE draft_issue_id=$1", [
          item.draft_issue_id,
        ]);
        await sql.query(
          `UPDATE project_draft_issues
           SET title='[deleted]',body='',deleted_at=$3,version=version+1,updated_at=$3
           WHERE project_id=$1 AND id=$2 AND deleted_at IS NULL`,
          [projectId, item.draft_issue_id, now],
        );
      }
      return {
        resourceId: item.id,
        data: { itemId: item.id, deleted: true, sourceDeleted: false },
      };
    }
    const archived = command.action === "archive-item";
    if (item.archived === archived) {
      throw new ProjectError(409, archived ? "Item 已封存。" : "Item 未封存。");
    }
    await sql.query(
      `UPDATE project_items
       SET archived=$3,version=version+1,updated_at=$4
       WHERE project_id=$1 AND id=$2 AND version=$5`,
      [projectId, item.id, archived, now, command.itemVersion],
    );
    return {
      resourceId: item.id,
      data: { itemId: item.id, archived, itemVersion: command.itemVersion + 1 },
    };
  }

  if (command.action === "move-item") {
    const item = await currentItem(sql, projectId, command.itemId);
    requireItemVersion(item, command.itemVersion);
    if (command.beforeItemId === item.id) {
      throw new ProjectError(409, "Item 排序沒有變更。");
    }
    const rows = (
      await sql.query(
        `SELECT id,position
         FROM project_items
         WHERE project_id=$1
         ORDER BY position,id`,
        [projectId],
      )
    ).rows as Array<{ id: string; position: number | string }>;
    const ordered = rows.map((row) => row.id);
    const from = ordered.indexOf(item.id);
    if (from < 0) throw new ProjectError(404, "找不到 Project item。");
    ordered.splice(from, 1);
    const before =
      command.beforeItemId === null ? ordered.length : ordered.indexOf(command.beforeItemId);
    if (before < 0) throw new ProjectError(409, "排序目標不屬於同一 Project。");
    ordered.splice(before, 0, item.id);
    const changed = rows.some((row, index) => row.id !== ordered[index]);
    if (!changed) throw new ProjectError(409, "Item 排序沒有變更。");
    for (let index = 0; index < ordered.length; index += 1) {
      await sql.query(
        `UPDATE project_items
         SET position=$3,
             version=CASE WHEN position IS DISTINCT FROM $3 THEN version+1 ELSE version END,
             updated_at=CASE WHEN position IS DISTINCT FROM $3 THEN $4 ELSE updated_at END
         WHERE project_id=$1 AND id=$2`,
        [projectId, ordered[index], index, now],
      );
    }
    return {
      resourceId: item.id,
      data: { itemId: item.id, position: ordered.indexOf(item.id) },
    };
  }

  if (command.action === "convert-draft-item") {
    const item = await currentItem(sql, projectId, command.itemId);
    requireItemVersion(item, command.itemVersion);
    if (!item.draft_issue_id) throw new ProjectError(409, "此 Item 不是 DraftIssue。");
    const draftRow = (
      await sql.query(
        `SELECT *
         FROM project_draft_issues
         WHERE project_id=$1 AND id=$2
         FOR UPDATE`,
        [projectId, item.draft_issue_id],
      )
    ).rows[0] as DraftRow | undefined;
    if (!draftRow || draftRow.deleted_at !== null) {
      throw new ProjectError(409, "DraftIssue 已刪除或無法轉換。");
    }
    const assigneeIds = await draftAssignees(sql, draftRow.id);
    const issue = await createIssueFromProjectDraft(sql, {
      userId,
      repositoryId: command.repositoryId,
      title: draftRow.title,
      body: draftRow.body,
      assigneeIds,
      now,
    });
    try {
      await sql.query(
        `UPDATE project_items
         SET repository_id=$3,
             issue_id=$4,
             draft_issue_id=NULL,
             source_version=$5,
             version=version+1,
             updated_at=$6
         WHERE project_id=$1 AND id=$2 AND version=$7`,
        [projectId, item.id, issue.repositoryId, issue.id, issue.version, now, command.itemVersion],
      );
    } catch (error) {
      postgresConflict(error, "DraftIssue conversion 目標 Issue 關係不合法。");
    }
    await sql.query("DELETE FROM project_draft_issue_assignees WHERE draft_issue_id=$1", [
      draftRow.id,
    ]);
    await sql.query(
      `UPDATE project_draft_issues
       SET title='[deleted]',body='',deleted_at=$3,version=version+1,updated_at=$3
       WHERE project_id=$1 AND id=$2`,
      [projectId, draftRow.id, now],
    );
    await ensureRepositoryReference(sql, projectId, issue.repositoryId);
    return {
      resourceId: item.id,
      data: {
        itemId: item.id,
        convertedDraftIssueId: draftRow.id,
        issueId: issue.id,
        repositoryId: issue.repositoryId,
        issueNumber: issue.number,
      },
    };
  }

  throw new ProjectError(400, "不是 Project item 操作。");
}
