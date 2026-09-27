import { readAccountLogins } from "@line-work/account/adapters/postgres";
import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";
import type { RepositoryStarStore, StarredRepository } from "../../application/ports/stars.js";
import { IssueError } from "../../domain.js";

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
      const owners = await readAccountLogins(
        sql,
        rows.map((row) => ({ id: row.owner_account_id, kind: row.owner_account_kind })),
      );
      const ownerLogins = new Map(
        owners.map((owner) => [`${owner.id}:\0:${owner.kind}`, owner.login]),
      );
      return rows.map((row) => {
        const ownerLogin = ownerLogins.get(`${row.owner_account_id}:\0:${row.owner_account_kind}`);
        if (!ownerLogin) throw new IssueError(409, "Repository owner locator 不可用。");
        return {
          id: row.id,
          ownerLogin,
          name: row.name,
          visibility: row.visibility,
          starredAt: Number(row.created_at),
          starCount: Number(row.star_count),
        };
      });
    });
  }
}
