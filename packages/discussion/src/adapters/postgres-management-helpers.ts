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
import { repositoryLabelIdsExist } from "@line_bot_v1/repository/postgres/resource-management";
import type {
  DiscussionCategory,
  DiscussionManagementCommand,
  DiscussionManagementIdentity,
  DiscussionManagementReceipt,
} from "../contracts/management.js";
import {
  canDiscussionRepositoryOperation,
  type Discussion,
  type DiscussionComment,
  DiscussionError,
} from "../domain.js";

export type CategoryRow = {
  id: string;
  repository_id: string;
  name: string;
  slug: string;
  description: string;
  emoji: string;
  is_answerable: boolean;
  version: number | string;
  created_at: number | string;
  updated_at: number | string;
};

export type DiscussionRow = {
  id: string;
  repository_id: string;
  number: number | string | null;
  author: string;
  title: string;
  body: string;
  category: string;
  category_id: string | null;
  state: Discussion["state"];
  state_reason: Discussion["stateReason"];
  closed_at: number | string | null;
  deleted_at: number | string | null;
  is_locked: boolean;
  lock_reason: Discussion["lockReason"];
  version: number | string;
  created_at: number | string;
  updated_at: number | string;
};

export type CommentRow = {
  id: string;
  discussion_id: string;
  author: string;
  body: string;
  reply_to_id: string | null;
  deleted_at: number | string | null;
  version: number | string;
  created_at: number | string;
  updated_at: number | string | null;
};

type StoredReceipt = Readonly<{
  receiptVersion: 1;
  family: "discussion-management";
  result: DiscussionManagementReceipt;
}>;

export const commandFingerprint = (command: DiscussionManagementCommand) =>
  createHash("sha256")
    .update(JSON.stringify({ family: "discussion-management", command }))
    .digest("hex");

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readReceipt(
  previous: { fingerprint: string; result: unknown } | undefined,
  fingerprint: string,
): DiscussionManagementReceipt | null {
  if (!previous) return null;
  if (previous.fingerprint !== fingerprint) {
    throw new DiscussionError(409, "此請求編號已用於不同 Discussion 操作。");
  }
  if (!record(previous.result)) throw new DiscussionError(503, "Discussion 回執無法讀取。");
  const envelope = previous.result as Partial<StoredReceipt>;
  const result = envelope.result;
  if (
    envelope.receiptVersion !== 1 ||
    envelope.family !== "discussion-management" ||
    !record(result) ||
    typeof result.requestId !== "string" ||
    typeof result.repositoryId !== "string" ||
    typeof result.action !== "string" ||
    !Number.isSafeInteger(result.version) ||
    !Number.isSafeInteger(result.at)
  ) {
    throw new DiscussionError(503, "Discussion 回執無法讀取。");
  }
  return result as DiscussionManagementReceipt;
}

function receiptEnvelope(result: DiscussionManagementReceipt): StoredReceipt {
  return { receiptVersion: 1, family: "discussion-management", result };
}

async function repositoryOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RepositoryError) {
      throw new DiscussionError(error.status, error.message);
    }
    throw error;
  }
}

export async function discussionScope(
  sql: Sql,
  identity: DiscussionManagementIdentity,
  repositoryId: string,
) {
  return repositoryOperation(() => repositoryScope(sql, identity, repositoryId));
}

export async function requireWritableRepository(sql: Sql, repositoryId: string) {
  if (await repositoryOperation(() => repositoryArchived(sql, repositoryId))) {
    throw new DiscussionError(409, "Repository 已封存，Discussion 目前為唯讀。");
  }
}

export function requireOperation(
  permissions: readonly RepositoryPermission[],
  operation: "participate" | "triage" | "manage" | "lock-conversation",
) {
  if (!canDiscussionRepositoryOperation(permissions, operation)) {
    throw new DiscussionError(403, "目前的 Repository access 不允許此 Discussion 操作。");
  }
}

export function canModerate(permissions: readonly RepositoryPermission[]) {
  return canDiscussionRepositoryOperation(permissions, "triage");
}

export function canManage(permissions: readonly RepositoryPermission[]) {
  return canDiscussionRepositoryOperation(permissions, "manage");
}

export function category(row: CategoryRow): DiscussionCategory {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    emoji: row.emoji,
    isAnswerable: row.is_answerable,
    version: Number(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export function discussion(row: DiscussionRow, categoryName?: string): Discussion {
  const deleted = row.deleted_at !== null;
  return {
    id: row.id,
    repositoryId: row.repository_id,
    number: row.number === null ? null : Number(row.number),
    author: row.author,
    title: row.title,
    body: deleted ? null : row.body,
    category: categoryName ?? row.category,
    categoryId: row.category_id,
    state: row.state,
    stateReason: row.state_reason,
    locked: row.is_locked,
    lockReason: row.lock_reason,
    deleted,
    version: Number(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export function comment(row: CommentRow): DiscussionComment {
  const deleted = row.deleted_at !== null;
  return {
    id: row.id,
    discussionId: row.discussion_id,
    author: row.author,
    body: deleted ? null : row.body,
    replyToId: row.reply_to_id,
    deleted,
    version: Number(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at ?? row.created_at),
  };
}

export async function currentCategory(
  sql: Sql,
  repositoryId: string,
  categoryId: string,
): Promise<CategoryRow> {
  const row = (
    await sql.query(
      `SELECT *
       FROM discussion_categories
       WHERE repository_id=$1 AND id=$2
       FOR UPDATE`,
      [repositoryId, categoryId],
    )
  ).rows[0] as CategoryRow | undefined;
  if (!row) throw new DiscussionError(404, "找不到 Discussion category。");
  return row;
}

export async function readableCategory(
  sql: Sql,
  repositoryId: string,
  categoryId: string,
): Promise<CategoryRow> {
  const row = (
    await sql.query(
      "SELECT * FROM discussion_categories WHERE repository_id=$1 AND id=$2",
      [repositoryId, categoryId],
    )
  ).rows[0] as CategoryRow | undefined;
  if (!row) throw new DiscussionError(409, "Category 必須存在於同一 Repository。");
  return row;
}

export async function currentDiscussion(
  sql: Sql,
  repositoryId: string,
  discussionId: string,
): Promise<DiscussionRow> {
  const row = (
    await sql.query(
      `SELECT *
       FROM discussions
       WHERE repository_id=$1 AND id=$2
       FOR UPDATE`,
      [repositoryId, discussionId],
    )
  ).rows[0] as DiscussionRow | undefined;
  if (!row || row.deleted_at !== null) throw new DiscussionError(404, "找不到 Discussion。");
  return row;
}

export async function currentComment(
  sql: Sql,
  discussionId: string,
  commentId: string,
): Promise<CommentRow> {
  const row = (
    await sql.query(
      `SELECT *
       FROM discussion_comments
       WHERE discussion_id=$1 AND id=$2
       FOR UPDATE`,
      [discussionId, commentId],
    )
  ).rows[0] as CommentRow | undefined;
  if (!row) throw new DiscussionError(404, "找不到 Discussion comment。");
  return row;
}

export function requireVersion(actual: number | string, expected: number, label: string) {
  if (Number(actual) !== expected) {
    throw new DiscussionError(409, `${label} 已更新，請重新讀取後再操作。`);
  }
}

export async function nextDiscussionNumber(sql: Sql, repositoryId: string): Promise<number> {
  await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `discussion-number:${repositoryId}`,
  ]);
  const row = (
    await sql.query(
      "SELECT COALESCE(MAX(number),0)+1 AS number FROM discussions WHERE repository_id=$1",
      [repositoryId],
    )
  ).rows[0] as { number: number | string };
  return Number(row.number);
}

export async function advanceDiscussion(
  sql: Sql,
  row: DiscussionRow,
  expectedVersion: number,
  now: number,
  patch: Partial<{
    number: number;
    title: string;
    body: string;
    category: string;
    categoryId: string;
    state: Discussion["state"];
    stateReason: Discussion["stateReason"];
    closedAt: number | null;
    deletedAt: number | null;
    locked: boolean;
    lockReason: Discussion["lockReason"];
  }> = {},
): Promise<DiscussionRow> {
  const updated = (
    await sql.query(
      `UPDATE discussions
       SET number=$3,
           title=$4,
           body=$5,
           category=$6,
           category_id=$7,
           state=$8,
           state_reason=$9,
           closed_at=$10,
           deleted_at=$11,
           is_locked=$12,
           lock_reason=$13,
           version=version+1,
           updated_at=$14
       WHERE id=$1 AND version=$2
       RETURNING *`,
      [
        row.id,
        expectedVersion,
        patch.number ?? row.number,
        patch.title ?? row.title,
        patch.body ?? row.body,
        patch.category ?? row.category,
        patch.categoryId ?? row.category_id,
        patch.state ?? row.state,
        "stateReason" in patch ? patch.stateReason : row.state_reason,
        "closedAt" in patch ? patch.closedAt : row.closed_at,
        "deletedAt" in patch ? patch.deletedAt : row.deleted_at,
        patch.locked ?? row.is_locked,
        "lockReason" in patch ? patch.lockReason : row.lock_reason,
        now,
      ],
    )
  ).rows[0] as DiscussionRow | undefined;
  if (!updated) throw new DiscussionError(409, "Discussion 已更新，請重新讀取後再操作。");
  return updated;
}

export async function discussionEvent(
  sql: Sql,
  discussionId: string,
  version: number,
  actor: string,
  action: string,
  data: Readonly<Record<string, unknown>>,
  now: number,
) {
  await sql.query(
    `INSERT INTO discussion_events(discussion_id,version,actor,action,data,at)
     VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
    [discussionId, version, actor, action, JSON.stringify(data), now],
  );
}

export async function categoryEvent(
  sql: Sql,
  categoryId: string,
  version: number,
  actor: string,
  action: string,
  data: Readonly<Record<string, unknown>>,
  now: number,
) {
  await sql.query(
    `INSERT INTO discussion_category_events(category_id,version,actor,action,data,at)
     VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
    [categoryId, version, actor, action, JSON.stringify(data), now],
  );
}

export async function storeReceipt(
  sql: Sql,
  actor: string,
  command: DiscussionManagementCommand,
  fingerprint: string,
  result: DiscussionManagementReceipt,
  now: number,
) {
  await sql.query(
    `INSERT INTO discussion_commands(actor,request_id,fingerprint,result,created_at)
     VALUES($1,$2,$3,$4::jsonb,$5)`,
    [actor, command.requestId, fingerprint, JSON.stringify(receiptEnvelope(result)), now],
  );
}

export async function labelsExist(
  sql: Sql,
  repositoryId: string,
  labelIds: readonly string[],
): Promise<boolean> {
  try {
    return await repositoryLabelIdsExist(sql, repositoryId, labelIds);
  } catch (error) {
    if (error instanceof RepositoryError) throw new DiscussionError(error.status, error.message);
    throw error;
  }
}
