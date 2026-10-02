import { readAccountLogins } from "@line_bot_v1/namespace/postgres";
import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { readableRepositoriesByIds } from "@line_bot_v1/repository/postgres/access";
import type { IssueActivityItem, IssueActivityStore } from "../../contracts/activity.js";
import { IssueError } from "../../domain.js";

type ActivityRow = {
  issue_id: string;
  version: number;
  actor: string;
  action: string;
  at: number | string;
  number: number | string;
  title: string;
  repository_id: string;
};

export class PostgresIssueActivityStore implements IssueActivityStore {
  constructor(private db: Database = businessDatabase()) {}

  activity(userId: string, limit: number): Promise<IssueActivityItem[]> {
    return this.db.transaction(async (sql) => {
      if (limit < 1) return [];

      const rows = (
        await sql.query(
          `SELECT e.issue_id,e.version,e.actor,e.action,e.at,
                  i.number,i.title,i.repository_id
           FROM issue_events e
           JOIN issues i ON i.id=e.issue_id
           WHERE EXISTS (
             SELECT 1
             FROM repository_visibility_access v
             WHERE v.repository_id=i.repository_id
               AND (v.user_id=$1 OR v.user_id IS NULL)
           )
           ORDER BY e.at DESC,e.issue_id,e.version DESC
           LIMIT $2`,
          [userId, limit],
        )
      ).rows as ActivityRow[];
      if (!rows.length) return [];

      const repositories = await readableRepositoriesByIds(sql, userId, [
        ...new Set(rows.map((row) => row.repository_id)),
      ]);
      const repositoryById = new Map(repositories.map((repository) => [repository.id, repository]));
      const visibleRows = rows.filter((row) => repositoryById.has(row.repository_id));
      if (!visibleRows.length) return [];

      const actors = await readAccountLogins(
        sql,
        visibleRows.map((row) => ({ id: row.actor, kind: "USER" as const })),
      );
      const actorLoginById = new Map(actors.map((actor) => [actor.id, actor.login]));

      return visibleRows.map((row) => {
        const repository = repositoryById.get(row.repository_id);
        if (!repository) throw new IssueError(409, "Issue activity Repository scope 不可用。");
        const actorLogin = actorLoginById.get(row.actor);
        if (!actorLogin) throw new IssueError(409, "Issue activity actor locator 不可用。");
        return {
          id: `${row.issue_id}:${row.version}`,
          occurredAt: Number(row.at),
          actorLogin,
          action: row.action,
          repository: {
            id: repository.id,
            ownerLogin: repository.ownerLogin,
            name: repository.name,
          },
          issue: {
            number: Number(row.number),
            title: row.title,
          },
        };
      });
    });
  }
}
