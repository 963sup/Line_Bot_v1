import { createHash } from "node:crypto";
import type { Sql } from "@line_bot_v1/platform/postgres";
import {
  RepositoryError,
  type RepositoryPermission,
} from "@line_bot_v1/repository/domain";
import {
  repositoryArchived,
  repositoryScope,
} from "@line_bot_v1/repository/postgres/access";
import type {
  IssueCollaborationCommand,
  IssueCollaborationIdentity,
  IssueCollaborationReceipt,
  IssueCommentView,
  IssueLockReason,
} from "../../contracts/collaboration.js";
import { canIssueRepositoryOperation, IssueError } from "../../domain.js";

export type IssueHead = {
  id: string;
  repository_id: string;
  version: number | string;
  milestone_id: string | null;
  is_locked: boolean;
  lock_reason: IssueLockReason | null;
};

export type CommentRow = {
  id: string;
  issue_id: string;
  author: string;
  body: string;
  deleted_at: number | string | null;
  version: number | string;
  created_at: number | string;
  updated_at: number | string;
};

type StoredReceipt = Readonly<{
  receiptVersion: 1;
  family: "issue-collaboration";
  result: IssueCollaborationReceipt;
}>;

export const fingerprint = (command: IssueCollaborationCommand) =>
  createHash("sha256")
    .update(JSON.stringify({ family: "issue-collaboration", command }))
    .digest("hex");

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readReceipt(
  previous: { fingerprint: string; result: unknown } | undefined,
  expectedFingerprint: string,
): IssueCollaborationReceipt | null {
  if (!previous) return null;
  if (previous.fingerprint !== expectedFingerprint) {
    throw new IssueError(409, "此請求編號已用於不同 Issue collaboration 操作。");
  }
  if (!record(previous.result)) throw new IssueError(503, "Issue collaboration 回執無法讀取。");
  const envelope = previous.result as Partial<StoredReceipt>;
  const result = envelope.result;
  if (
    envelope.receiptVersion !== 1 ||
    envelope.family !== "issue-collaboration" ||
    !record(result) ||
    typeof result.requestId !== "string" ||
    typeof result.repositoryId !== "string" ||
    typeof result.issueId !== "string" ||
    typeof result.action !== "string" ||
    !Number.isSafeInteger(result.version) ||
    !Number.isSafeInteger(result.at)
  ) {
    throw new IssueError(503, "Issue collaboration 回執無法讀取。");
  }
  return result as IssueCollaborationReceipt;
}

export function storedReceipt(result: IssueCollaborationReceipt): StoredReceipt {
  return { receiptVersion: 1, family: "issue-collaboration", result };
}

export async function repositoryOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RepositoryError) throw new IssueError(error.status, error.message);
    throw error;
  }
}

export function privilegedCommenter(permissions: readonly RepositoryPermission[]) {
  return permissions.some(
    (permission) =>
      permission === "write" || permission === "maintain" || permission === "admin",
  );
}

export async function sourceScope(
  sql: Sql,
  who: IssueCollaborationIdentity,
  repositoryId: string,
) {
  return repositoryOperation(() => repositoryScope(sql, who, repositoryId));
}

export async function currentIssue(
  sql: Sql,
  repositoryId: string,
  issueId: string,
): Promise<IssueHead> {
  const row = (
    await sql.query(
      `SELECT id,repository_id,version,milestone_id,is_locked,lock_reason
       FROM issues
       WHERE repository_id=$1 AND id=$2
       FOR UPDATE`,
      [repositoryId, issueId],
    )
  ).rows[0] as IssueHead | undefined;
  if (!row) throw new IssueError(404, "找不到 Issue。");
  return row;
}

export function requireExpectedVersion(issue: IssueHead, expectedVersion: number) {
  if (Number(issue.version) !== expectedVersion) {
    throw new IssueError(409, "Issue 已更新，請重新讀取後再操作。");
  }
}

export function requireActionPermission(
  permissions: readonly RepositoryPermission[],
  action: IssueCollaborationCommand["action"],
) {
  const operation =
    action === "add-comment" || action === "edit-comment" || action === "delete-comment"
      ? "comment"
      : action === "lock" || action === "unlock"
        ? "lock-conversation"
        : "triage";
  if (!canIssueRepositoryOperation(permissions, operation)) {
    throw new IssueError(403, "目前的 Repository access 不允許此 Issue collaboration 操作。");
  }
}

export async function targetIssue(
  sql: Sql,
  who: IssueCollaborationIdentity,
  sourceIssueId: string,
  targetIssueId: string,
) {
  if (sourceIssueId === targetIssueId) {
    throw new IssueError(409, "Issue 關係不能指向自己。");
  }
  const row = (
    await sql.query("SELECT id,repository_id FROM issues WHERE id=$1", [targetIssueId])
  ).rows[0] as { id: string; repository_id: string } | undefined;
  if (!row) throw new IssueError(404, "找不到目標 Issue。");
  const selected = await sourceScope(sql, who, row.repository_id);
  if (!canIssueRepositoryOperation(selected.repository.permissions, "triage")) {
    throw new IssueError(403, "目前的 Repository access 不允許修改目標 Issue 關係。");
  }
  if (await repositoryOperation(() => repositoryArchived(sql, row.repository_id))) {
    throw new IssueError(409, "目標 Repository 已封存，不能修改 Issue 關係。");
  }
  return row;
}

export function comment(row: CommentRow): IssueCommentView {
  const deleted = row.deleted_at !== null;
  return {
    id: row.id,
    issueId: row.issue_id,
    author: row.author,
    body: deleted ? null : row.body,
    deleted,
    version: Number(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function visibleRelatedIds(
  sql: Sql,
  userId: string,
  query: string,
  issueId: string,
): Promise<string[]> {
  const rows = (await sql.query(query, [issueId, userId])).rows as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

export async function advance(
  sql: Sql,
  issue: IssueHead,
  expectedVersion: number,
  now: number,
  patch?: {
    milestoneId?: string | null;
    locked?: boolean;
    lockReason?: IssueLockReason | null;
  },
): Promise<number> {
  const milestoneId = patch && "milestoneId" in patch ? patch.milestoneId : issue.milestone_id;
  const locked = patch?.locked ?? issue.is_locked;
  const lockReason = patch && "lockReason" in patch ? patch.lockReason : issue.lock_reason;
  const row = (
    await sql.query(
      `UPDATE issues
       SET milestone_id=$3,is_locked=$4,lock_reason=$5,version=version+1,updated_at=$6
       WHERE id=$1 AND version=$2
       RETURNING version`,
      [issue.id, expectedVersion, milestoneId, locked, lockReason, now],
    )
  ).rows[0] as { version: number | string } | undefined;
  if (!row) throw new IssueError(409, "Issue 已更新，請重新讀取後再操作。");
  return Number(row.version);
}

export async function hierarchyWouldCycle(
  sql: Sql,
  parentIssueId: string,
  childIssueId: string,
) {
  const row = (
    await sql.query(
      `WITH RECURSIVE descendants(id) AS (
         SELECT child_issue_id FROM issue_sub_issues WHERE parent_issue_id=$1
         UNION
         SELECT link.child_issue_id
         FROM issue_sub_issues link
         JOIN descendants d ON link.parent_issue_id=d.id
       )
       SELECT 1 FROM descendants WHERE id=$2 LIMIT 1`,
      [childIssueId, parentIssueId],
    )
  ).rows[0];
  return Boolean(row);
}

export async function dependencyWouldCycle(
  sql: Sql,
  blockedIssueId: string,
  blockingIssueId: string,
) {
  const row = (
    await sql.query(
      `WITH RECURSIVE blockers(id) AS (
         SELECT blocking_issue_id FROM issue_dependencies WHERE blocked_issue_id=$1
         UNION
         SELECT link.blocking_issue_id
         FROM issue_dependencies link
         JOIN blockers b ON link.blocked_issue_id=b.id
       )
       SELECT 1 FROM blockers WHERE id=$2 LIMIT 1`,
      [blockingIssueId, blockedIssueId],
    )
  ).rows[0];
  return Boolean(row);
}

export function duplicateRelation(error: unknown): never {
  const postgres = error as { code?: string };
  if (postgres.code === "23505") {
    throw new IssueError(409, "Issue 關係已存在或目標已有 parent。");
  }
  if (postgres.code === "23514") {
    throw new IssueError(409, "Issue 關係不合法。");
  }
  throw error;
}

export async function requireWritableRepository(
  sql: Sql,
  repositoryId: string,
) {
  if (await repositoryOperation(() => repositoryArchived(sql, repositoryId))) {
    throw new IssueError(409, "Repository 已封存，Issue 目前為唯讀。");
  }
}
