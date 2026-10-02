import type { Sql } from "@line_bot_v1/platform/postgres";
import { RepositoryError } from "@line_bot_v1/repository/domain";
import {
  repositoryArchived,
  repositoryScope,
} from "@line_bot_v1/repository/postgres/access";
import { allocateRepositoryIssueNumber } from "@line_bot_v1/repository/postgres/issue-number";
import {
  canIssueRepositoryOperation,
  IssueError,
} from "../domain.js";

export type ProjectIssueReference = Readonly<{
  id: string;
  repositoryId: string;
  number: number;
  title: string;
  state: "OPEN" | "CLOSED";
  version: number;
}>;

async function repositoryOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RepositoryError) {
      throw new IssueError(error.status, error.message);
    }
    throw error;
  }
}

export async function readProjectIssueReference(
  sql: Sql,
  userId: string,
  issueId: string,
): Promise<ProjectIssueReference | null> {
  const row = (
    await sql.query(
      `SELECT id,repository_id,number,title,state,version
       FROM issues
       WHERE id=$1`,
      [issueId],
    )
  ).rows[0] as
    | {
        id: string;
        repository_id: string;
        number: number | string;
        title: string;
        state: "OPEN" | "CLOSED" | null;
        version: number | string;
      }
    | undefined;
  if (!row) return null;

  try {
    await repositoryScope(sql, { userId }, row.repository_id);
  } catch (error) {
    if (error instanceof RepositoryError && (error.status === 403 || error.status === 404)) {
      return null;
    }
    throw error;
  }

  return {
    id: row.id,
    repositoryId: row.repository_id,
    number: Number(row.number),
    title: row.title,
    state: row.state ?? "OPEN",
    version: Number(row.version),
  };
}

export async function createIssueFromProjectDraft(
  sql: Sql,
  input: Readonly<{
    userId: string;
    repositoryId: string;
    title: string;
    body: string;
    assigneeIds: readonly string[];
    now: number;
  }>,
): Promise<ProjectIssueReference> {
  const selected = await repositoryOperation(() =>
    repositoryScope(sql, { userId: input.userId }, input.repositoryId),
  );
  if (!canIssueRepositoryOperation(selected.repository.permissions, "open")) {
    throw new IssueError(403, "目前的 Repository access 不允許建立 Issue。");
  }
  if (
    input.assigneeIds.length &&
    !canIssueRepositoryOperation(selected.repository.permissions, "assign")
  ) {
    throw new IssueError(403, "目前的 Repository access 不允許指派 Issue。");
  }
  if (await repositoryOperation(() => repositoryArchived(sql, input.repositoryId))) {
    throw new IssueError(409, "Repository 已封存，Issue 目前為唯讀。");
  }

  const participants = new Set(selected.participants.map((item) => item.userId));
  for (const assigneeId of input.assigneeIds) {
    if (!participants.has(assigneeId)) {
      throw new IssueError(403, "Draft assignee 必須有目標 Repository 的 current access。");
    }
  }

  const issueId = crypto.randomUUID();
  const number = await repositoryOperation(() =>
    allocateRepositoryIssueNumber(sql, input.repositoryId),
  );
  await sql.query(
    `INSERT INTO issues(
       id,repository_id,number,publisher,title,body,criteria,
       state,state_reason,workflow_status,version,created_at,updated_at
     ) VALUES($1,$2,$3,$4,$5,$6,'','OPEN',NULL,'pending',1,$7,$7)`,
    [
      issueId,
      input.repositoryId,
      number,
      input.userId,
      input.title,
      input.body,
      input.now,
    ],
  );
  if (input.assigneeIds.length) {
    await sql.query(
      `INSERT INTO issue_assignees(issue_id,user_id,assigned_at)
       SELECT $1,user_id,$3
       FROM unnest($2::text[]) AS user_id`,
      [issueId, input.assigneeIds, input.now],
    );
  }
  await sql.query(
    `INSERT INTO issue_events(issue_id,version,actor,action,note,data,at)
     VALUES($1,1,$2,'create','',$3::jsonb,$4)`,
    [
      issueId,
      input.userId,
      JSON.stringify({
        state: "OPEN",
        stateReason: null,
        workflowStatus: "pending",
        assigneeIds: input.assigneeIds,
        source: "project-draft-conversion",
      }),
      input.now,
    ],
  );

  return {
    id: issueId,
    repositoryId: input.repositoryId,
    number,
    title: input.title,
    state: "OPEN",
    version: 1,
  };
}
