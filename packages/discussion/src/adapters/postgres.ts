import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import { RepositoryError, type RepositorySummary } from "@line_bot_v1/repository/domain";
import { authorizedRepository } from "@line_bot_v1/repository/postgres/access";
import type {
  DiscussionCursor,
  DiscussionIdentity,
  DiscussionReadStore,
  DiscussionResult,
  DiscussionsResult,
} from "../contracts/output/discussion-read.js";
import { DiscussionError, type DiscussionSummary } from "../domain.js";
import {
  type CommentRow,
  comment,
  type DiscussionRow,
  discussion,
} from "./postgres-management-helpers.js";

type ReadDiscussionRow = DiscussionRow & { category_name: string | null };

function discussionSummary(row: ReadDiscussionRow): DiscussionSummary {
  const value = discussion(row, row.category_name ?? undefined);
  return {
    id: value.id,
    repositoryId: value.repositoryId,
    number: value.number,
    author: value.author,
    title: value.title,
    category: value.category,
    categoryId: value.categoryId,
    state: value.state,
    stateReason: value.stateReason,
    locked: value.locked,
    lockReason: value.lockReason,
    deleted: value.deleted,
    version: value.version,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function next(items: { id: string; createdAt: number }[], hasMore: boolean) {
  const last = items.at(-1);
  return hasMore && last ? JSON.stringify({ at: last.createdAt, id: last.id }) : null;
}

async function repository(
  sql: Sql,
  who: DiscussionIdentity,
  selector: RepositorySelector,
): Promise<RepositorySummary> {
  try {
    return await authorizedRepository(sql, who, selector);
  } catch (error) {
    if (error instanceof RepositoryError) {
      if (error.status === 403 || error.status === 404) {
        throw new DiscussionError(404, "找不到可存取的 Repository。");
      }
      throw new DiscussionError(error.status, error.message);
    }
    throw error;
  }
}

async function detailRows(
  sql: Sql,
  repositoryId: string,
  predicate: "id" | "number",
  value: string | number,
  commentsAfter?: DiscussionCursor,
): Promise<{
  row: ReadDiscussionRow;
  comments: ReturnType<typeof comment>[];
  next: string | null;
}> {
  const row = (
    await sql.query(
      `SELECT d.*,c.name AS category_name
       FROM discussions d
       LEFT JOIN discussion_categories c ON c.id=d.category_id
       WHERE d.repository_id=$1
         AND d.${predicate}=$2
         AND d.deleted_at IS NULL`,
      [repositoryId, value],
    )
  ).rows[0] as ReadDiscussionRow | undefined;
  if (!row) throw new DiscussionError(404, "找不到 Discussion。");

  const commentRows = (
    await sql.query(
      `SELECT *
       FROM discussion_comments
       WHERE discussion_id=$1
         AND ($2::bigint IS NULL OR created_at>$2 OR (created_at=$2 AND id>$3))
       ORDER BY created_at ASC,id ASC
       LIMIT 51`,
      [row.id, commentsAfter?.at ?? null, commentsAfter?.id ?? null],
    )
  ).rows as CommentRow[];
  const comments = commentRows.map(comment);
  const hasMore = comments.length > 50;
  if (hasMore) comments.pop();
  return { row, comments, next: next(comments, hasMore) };
}

export class PostgresDiscussionReadStore implements DiscussionReadStore {
  constructor(private readonly db: Database = businessDatabase()) {}

  list(
    who: DiscussionIdentity,
    selector: RepositorySelector,
    after?: DiscussionCursor,
  ): Promise<DiscussionsResult> {
    return this.db.transaction(async (sql) => {
      const selected = await repository(sql, who, selector);
      const rows = (
        await sql.query(
          `SELECT d.*,c.name AS category_name
           FROM discussions d
           LEFT JOIN discussion_categories c ON c.id=d.category_id
           WHERE d.repository_id=$1
             AND d.deleted_at IS NULL
             AND ($2::bigint IS NULL OR d.created_at<$2 OR (d.created_at=$2 AND d.id>$3))
           ORDER BY d.created_at DESC,d.id ASC
           LIMIT 21`,
          [selected.id, after?.at ?? null, after?.id ?? null],
        )
      ).rows as ReadDiscussionRow[];
      const discussions = rows.map(discussionSummary);
      const hasMore = discussions.length > 20;
      if (hasMore) discussions.pop();
      return { repository: selected, discussions, next: next(discussions, hasMore) };
    });
  }

  detail(
    who: DiscussionIdentity,
    selector: RepositorySelector,
    discussionId: string,
    commentsAfter?: DiscussionCursor,
  ): Promise<DiscussionResult> {
    return this.db.transaction(async (sql) => {
      const selected = await repository(sql, who, selector);
      const values = await detailRows(sql, selected.id, "id", discussionId, commentsAfter);
      return {
        repository: selected,
        discussion: discussion(values.row, values.row.category_name ?? undefined),
        comments: values.comments,
        next: values.next,
      };
    });
  }

  detailByNumber(
    who: DiscussionIdentity,
    selector: RepositorySelector,
    discussionNumber: number,
    commentsAfter?: DiscussionCursor,
  ): Promise<DiscussionResult> {
    return this.db.transaction(async (sql) => {
      const selected = await repository(sql, who, selector);
      const values = await detailRows(sql, selected.id, "number", discussionNumber, commentsAfter);
      return {
        repository: selected,
        discussion: discussion(values.row, values.row.category_name ?? undefined),
        comments: values.comments,
        next: values.next,
      };
    });
  }
}
