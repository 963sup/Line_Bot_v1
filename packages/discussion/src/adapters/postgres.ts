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
import {
  type Discussion,
  type DiscussionComment,
  DiscussionError,
  type DiscussionSummary,
} from "../domain.js";

type DiscussionRow = {
  id: string;
  repository_id: string;
  author: string;
  title: string;
  body: string;
  category: string;
  version: number;
  created_at: number | string;
  updated_at: number | string;
};

type CommentRow = {
  id: string;
  discussion_id: string;
  author: string;
  body: string;
  version: number;
  created_at: number | string;
};

function discussion(row: DiscussionRow): Discussion {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    author: row.author,
    title: row.title,
    body: row.body,
    category: row.category,
    version: row.version,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function discussionSummary(row: DiscussionRow): DiscussionSummary {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    author: row.author,
    title: row.title,
    category: row.category,
    version: row.version,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function comment(row: CommentRow): DiscussionComment {
  return {
    id: row.id,
    discussionId: row.discussion_id,
    author: row.author,
    body: row.body,
    version: row.version,
    createdAt: Number(row.created_at),
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

export class PostgresDiscussionReadStore implements DiscussionReadStore {
  constructor(private db: Database = businessDatabase()) {}

  list(
    who: DiscussionIdentity,
    selector: RepositorySelector,
    after?: DiscussionCursor,
  ): Promise<DiscussionsResult> {
    return this.db.transaction(async (sql) => {
      const selected = await repository(sql, who, selector);
      const rows = (
        await sql.query(
          `SELECT *
           FROM discussions
           WHERE repository_id=$1
             AND ($2::bigint IS NULL OR created_at<$2 OR (created_at=$2 AND id>$3))
           ORDER BY created_at DESC,id ASC
           LIMIT 21`,
          [selected.id, after?.at ?? null, after?.id ?? null],
        )
      ).rows as DiscussionRow[];
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
      const row = (
        await sql.query("SELECT * FROM discussions WHERE repository_id=$1 AND id=$2", [
          selected.id,
          discussionId,
        ])
      ).rows[0] as DiscussionRow | undefined;
      if (!row) throw new DiscussionError(404, "找不到 Discussion。");
      const rows = (
        await sql.query(
          `SELECT *
           FROM discussion_comments
           WHERE discussion_id=$1
             AND ($2::bigint IS NULL OR created_at>$2 OR (created_at=$2 AND id>$3))
           ORDER BY created_at ASC,id ASC
           LIMIT 51`,
          [discussionId, commentsAfter?.at ?? null, commentsAfter?.id ?? null],
        )
      ).rows as CommentRow[];
      const comments = rows.map(comment);
      const hasMore = comments.length > 50;
      if (hasMore) comments.pop();
      return {
        repository: selected,
        discussion: discussion(row),
        comments,
        next: next(comments, hasMore),
      };
    });
  }
}
