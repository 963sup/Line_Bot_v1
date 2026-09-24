import { readAccountLogin } from "@line-work/account/adapters/postgres";
import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";
import type {
  ExploreRepository,
  RepositoryStarStore,
  StarredRepository,
} from "../../application/ports/stars.js";
import { IssueError, type RepositoryCapability } from "../../domain.js";

async function requireAccess(sql: Sql, userId: string, repositoryId: string): Promise<void> {
  const row = (
    await sql.query(
      "SELECT 1 FROM repository_effective_access WHERE repository_id=$1 AND user_id=$2",
      [repositoryId, userId],
    )
  ).rows[0];
  if (!row) throw new IssueError(403, "沒有此 Repository 的存取權限。");
}

export class PostgresRepositoryStarStore implements RepositoryStarStore {
  constructor(private db: Database = businessDatabase()) {}

  star(userId: string, repositoryId: string, at: number): Promise<void> {
    return this.db.transaction(async (sql) => {
      await requireAccess(sql, userId, repositoryId);
      await sql.query(
        "INSERT INTO repository_stars(repository_id,user_id,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [repositoryId, userId, at],
      );
    });
  }

  unstar(userId: string, repositoryId: string): Promise<void> {
    return this.db.transaction(async (sql) => {
      await requireAccess(sql, userId, repositoryId);
      await sql.query("DELETE FROM repository_stars WHERE repository_id=$1 AND user_id=$2", [
        repositoryId,
        userId,
      ]);
    });
  }

  starred(userId: string): Promise<StarredRepository[]> {
    return this.db.transaction(async (sql) => {
      const rows = (
        await sql.query(
          `SELECT r.id,r.owner_account_id,r.owner_account_kind,r.name,r.visibility,s.created_at,
                  (SELECT count(*)::int FROM repository_stars all_stars WHERE all_stars.repository_id=r.id) AS star_count
           FROM repository_stars s
           JOIN repositories r ON r.id=s.repository_id
           JOIN repository_effective_access a ON a.repository_id=r.id AND a.user_id=$1
           WHERE s.user_id=$1
           ORDER BY s.created_at DESC,r.id`,
          [userId],
        )
      ).rows as Array<{
        id: string;
        owner_account_id: string;
        owner_account_kind: "USER" | "ORGANIZATION";
        name: string;
        visibility: string;
        created_at: number | string;
        star_count: number | string;
      }>;
      const result: StarredRepository[] = [];
      for (const row of rows) {
        const owner = await readAccountLogin(sql, row.owner_account_id, row.owner_account_kind);
        if (!owner) throw new IssueError(409, "Repository owner locator 不可用。");
        result.push({
          id: row.id,
          ownerLogin: owner.login,
          name: row.name,
          visibility: row.visibility,
          starredAt: Number(row.created_at),
          starCount: Number(row.star_count),
        });
      }
      return result;
    });
  }

  explore(userId: string): Promise<ExploreRepository[]> {
    return this.db.transaction(async (sql) => {
      const rows = (
        await sql.query(
          `SELECT r.id,r.owner_account_id,r.owner_account_kind,r.name,r.visibility,a.capability,
                  count(s.user_id)::int AS star_count,
                  bool_or(s.user_id=$1) AS starred
           FROM repository_effective_access a
           JOIN repositories r ON r.id=a.repository_id
           LEFT JOIN repository_stars s ON s.repository_id=r.id
           WHERE a.user_id=$1
           GROUP BY r.id,r.owner_account_id,r.owner_account_kind,r.name,r.visibility,a.capability
           ORDER BY count(s.user_id) DESC,lower(r.name),r.id
           LIMIT 50`,
          [userId],
        )
      ).rows as Array<{
        id: string;
        owner_account_id: string;
        owner_account_kind: "USER" | "ORGANIZATION";
        name: string;
        visibility: string;
        capability: RepositoryCapability;
        star_count: number | string;
        starred: boolean;
      }>;
      const result: ExploreRepository[] = [];
      for (const row of rows) {
        const owner = await readAccountLogin(sql, row.owner_account_id, row.owner_account_kind);
        if (!owner) throw new IssueError(409, "Repository owner locator 不可用。");
        result.push({
          id: row.id,
          ownerLogin: owner.login,
          name: row.name,
          visibility: row.visibility,
          capability: row.capability,
          starCount: Number(row.star_count),
          starred: Boolean(row.starred),
        });
      }
      return result;
    });
  }
}
