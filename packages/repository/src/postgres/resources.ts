import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import type {
  RepositoryLabel,
  RepositoryLabelCursor,
  RepositoryLabelsResult,
  RepositoryMilestone,
  RepositoryMilestoneCursor,
  RepositoryMilestoneResult,
  RepositoryMilestoneStatus,
  RepositoryMilestonesResult,
  RepositoryResourceIdentity,
  RepositoryResourceStore,
} from "../contracts/output/resources.js";
import type { RepositorySelector } from "../contracts/selectors.js";
import { RepositoryError } from "../domain.js";
import { authorizedRepository } from "./access.js";

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
    if (error instanceof RepositoryError && (error.status === 403 || error.status === 404)) {
      throw new RepositoryError(404, "找不到可存取的 Repository。");
    }
    throw error;
  }
}

export class PostgresRepositoryResourceStore implements RepositoryResourceStore {
  constructor(private db: Database = businessDatabase()) {}

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
      return { repository, milestones, next: nextMilestone(milestones, hasMore) };
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
      if (!row) throw new RepositoryError(404, "找不到 Milestone。");
      return { repository, milestone: milestone(row) };
    });
  }
}
