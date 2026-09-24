import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";
import type {
  RepositoryDiscussion,
  RepositoryDiscussionComment,
  RepositoryDiscussionResult,
  RepositoryDiscussionsResult,
  RepositoryLabel,
  RepositoryLabelCursor,
  RepositoryLabelsResult,
  RepositoryMilestone,
  RepositoryMilestoneCursor,
  RepositoryMilestoneResult,
  RepositoryMilestoneStatus,
  RepositoryMilestonesResult,
  RepositoryResourceCursor,
  RepositoryResourceIdentity,
  RepositoryResourceStore,
} from "../../application/ports/resources.js";
import type { RepositorySelector } from "../../application/ports/selectors.js";
import { IssueError } from "../../domain.js";
import { authorizedRepository } from "./access.js";

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

type LabelRow = {
  id: string;
  repository_id: string;
  name: string;
  color: string;
  description: string;
  version: number;
};

type MilestoneRow = {
  id: string;
  repository_id: string;
  number: number | string;
  title: string;
  description: string;
  status: RepositoryMilestoneStatus;
  due_at: number | string | null;
  version: number;
  created_at: number | string;
  updated_at: number | string;
};

function discussion(row: DiscussionRow): RepositoryDiscussion {
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

function discussionSummary(row: DiscussionRow) {
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

function comment(row: CommentRow): RepositoryDiscussionComment {
  return {
    id: row.id,
    discussionId: row.discussion_id,
    author: row.author,
    body: row.body,
    version: row.version,
    createdAt: Number(row.created_at),
  };
}

function label(row: LabelRow): RepositoryLabel {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    name: row.name,
    color: row.color,
    description: row.description,
    version: row.version,
  };
}

function milestone(row: MilestoneRow): RepositoryMilestone {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    number: Number(row.number),
    title: row.title,
    description: row.description,
    status: row.status,
    dueAt: row.due_at === null ? null : Number(row.due_at),
    version: row.version,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function nextResource(items: { id: string; createdAt: number }[], hasMore: boolean) {
  const last = items.at(-1);
  return hasMore && last ? JSON.stringify({ at: last.createdAt, id: last.id }) : null;
}

function nextLabel(items: RepositoryLabel[], hasMore: boolean) {
  const last = items.at(-1);
  return hasMore && last ? JSON.stringify({ name: last.name, id: last.id }) : null;
}

function nextMilestone(items: RepositoryMilestone[], hasMore: boolean) {
  const last = items.at(-1);
  return hasMore && last ? JSON.stringify({ number: last.number, id: last.id }) : null;
}

async function resourceRepository(
  sql: Sql,
  who: RepositoryResourceIdentity,
  selector: RepositorySelector,
) {
  try {
    return await authorizedRepository(sql, who, selector);
  } catch (error) {
    if (error instanceof IssueError && (error.status === 403 || error.status === 404)) {
      throw new IssueError(404, "找不到可存取的 Repository。");
    }
    throw error;
  }
}

export class PostgresRepositoryResourceStore implements RepositoryResourceStore {
  constructor(private db: Database = businessDatabase()) {}

  discussions(
    who: RepositoryResourceIdentity,
    selector: RepositorySelector,
    after?: RepositoryResourceCursor,
  ): Promise<RepositoryDiscussionsResult> {
    return this.db.transaction(async (sql) => {
      const repository = await resourceRepository(sql, who, selector);
      const rows = (
        await sql.query(
          `SELECT *
           FROM discussions
           WHERE repository_id=$1
             AND ($2::bigint IS NULL OR created_at<$2 OR (created_at=$2 AND id>$3))
           ORDER BY created_at DESC,id ASC
           LIMIT 21`,
          [repository.id, after?.at ?? null, after?.id ?? null],
        )
      ).rows as DiscussionRow[];
      const mapped = rows.map(discussionSummary);
      const hasMore = mapped.length > 20;
      if (hasMore) mapped.pop();
      return {
        repository,
        discussions: mapped,
        next: nextResource(mapped, hasMore),
      };
    });
  }

  discussion(
    who: RepositoryResourceIdentity,
    selector: RepositorySelector,
    discussionId: string,
    commentsAfter?: RepositoryResourceCursor,
  ): Promise<RepositoryDiscussionResult> {
    return this.db.transaction(async (sql) => {
      const repository = await resourceRepository(sql, who, selector);
      const row = (
        await sql.query("SELECT * FROM discussions WHERE repository_id=$1 AND id=$2", [
          repository.id,
          discussionId,
        ])
      ).rows[0] as DiscussionRow | undefined;
      if (!row) throw new IssueError(404, "找不到 Discussion。");
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
        repository,
        discussion: discussion(row),
        comments,
        next: nextResource(comments, hasMore),
      };
    });
  }

  labels(
    who: RepositoryResourceIdentity,
    selector: RepositorySelector,
    after?: RepositoryLabelCursor,
  ): Promise<RepositoryLabelsResult> {
    return this.db.transaction(async (sql) => {
      const repository = await resourceRepository(sql, who, selector);
      const rows = (
        await sql.query(
          `SELECT *
           FROM repository_labels
           WHERE repository_id=$1
             AND ($2::text IS NULL OR name>$2 OR (name=$2 AND id>$3))
           ORDER BY name ASC,id ASC
           LIMIT 101`,
          [repository.id, after?.name ?? null, after?.id ?? null],
        )
      ).rows as LabelRow[];
      const labels = rows.map(label);
      const hasMore = labels.length > 100;
      if (hasMore) labels.pop();
      return { repository, labels, next: nextLabel(labels, hasMore) };
    });
  }

  milestones(
    who: RepositoryResourceIdentity,
    selector: RepositorySelector,
    status?: RepositoryMilestoneStatus,
    after?: RepositoryMilestoneCursor,
  ): Promise<RepositoryMilestonesResult> {
    return this.db.transaction(async (sql) => {
      const repository = await resourceRepository(sql, who, selector);
      const rows = (
        await sql.query(
          `SELECT *
           FROM repository_milestones
           WHERE repository_id=$1
             AND ($2::text IS NULL OR status=$2)
             AND ($3::bigint IS NULL OR number<$3 OR (number=$3 AND id>$4))
           ORDER BY number DESC,id ASC
           LIMIT 51`,
          [repository.id, status ?? null, after?.number ?? null, after?.id ?? null],
        )
      ).rows as MilestoneRow[];
      const milestones = rows.map(milestone);
      const hasMore = milestones.length > 50;
      if (hasMore) milestones.pop();
      return {
        repository,
        milestones,
        next: nextMilestone(milestones, hasMore),
      };
    });
  }

  milestone(
    who: RepositoryResourceIdentity,
    selector: RepositorySelector,
    number: number,
  ): Promise<RepositoryMilestoneResult> {
    return this.db.transaction(async (sql) => {
      const repository = await resourceRepository(sql, who, selector);
      const row = (
        await sql.query(
          "SELECT * FROM repository_milestones WHERE repository_id=$1 AND number=$2",
          [repository.id, number],
        )
      ).rows[0] as MilestoneRow | undefined;
      if (!row) throw new IssueError(404, "找不到 Milestone。");
      return { repository, milestone: milestone(row) };
    });
  }
}
