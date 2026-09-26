import { readAccountLogins } from "@line-work/account/adapters/postgres";
import { businessDatabase, type Database } from "@line-work/platform/adapters/postgres";
import type {
  RepositoryActivityItem,
  RepositoryDiscoveryOptions,
  RepositoryDiscoverySnapshot,
  RepositoryDiscoveryStore,
  TrendingRepository,
} from "../../application/ports/discovery.js";
import { IssueError, type RepositoryCapability } from "../../domain.js";

type TrendingRow = {
  id: string;
  owner_account_id: string;
  owner_account_kind: "USER" | "ORGANIZATION";
  name: string;
  visibility: string;
  capability: RepositoryCapability;
  recent_star_count: number | string;
  star_count: number | string;
  starred: boolean;
};

type ActivityRow = {
  issue_id: string;
  version: number;
  actor: string;
  action: string;
  at: number | string;
  number: number | string;
  title: string;
  repository_id: string;
  owner_account_id: string;
  owner_account_kind: "USER" | "ORGANIZATION";
  repository_name: string;
};

const accountKey = (id: string, kind: "USER" | "ORGANIZATION") => `${id}:\0:${kind}`;

export class PostgresRepositoryDiscoveryStore implements RepositoryDiscoveryStore {
  constructor(private db: Database = businessDatabase()) {}

  snapshot(
    userId: string,
    options: RepositoryDiscoveryOptions,
  ): Promise<RepositoryDiscoverySnapshot> {
    return this.db.transaction(async (sql) => {
      const trendingRows = (
        await sql.query(
          `SELECT r.id,r.owner_account_id,r.owner_account_kind,r.name,r.visibility,a.capability,
                  (count(s.user_id) FILTER (WHERE s.created_at >= $2))::int AS recent_star_count,
                  count(s.user_id)::int AS star_count,
                  coalesce(bool_or(s.user_id=$1),false) AS starred
           FROM repository_effective_access a
           JOIN repositories r ON r.id=a.repository_id
           LEFT JOIN repository_stars s ON s.repository_id=r.id
           WHERE a.user_id=$1
           GROUP BY r.id,r.owner_account_id,r.owner_account_kind,r.name,r.visibility,a.capability
           ORDER BY
             count(s.user_id) FILTER (WHERE s.created_at >= $2) DESC,
             count(s.user_id) DESC,
             lower(r.name),
             r.id
           LIMIT $3`,
          [userId, options.recentSince, options.trendingLimit],
        )
      ).rows as TrendingRow[];

      const activityRows = (
        await sql.query(
          `SELECT e.issue_id,e.version,e.actor,e.action,e.at,
                  i.number,i.title,
                  r.id AS repository_id,r.owner_account_id,r.owner_account_kind,
                  r.name AS repository_name
           FROM issue_events e
           JOIN issues i ON i.id=e.issue_id
           JOIN repositories r ON r.id=i.repository_id
           JOIN repository_effective_access a
             ON a.repository_id=r.id AND a.user_id=$1
           ORDER BY e.at DESC,e.issue_id,e.version DESC
           LIMIT $2`,
          [userId, options.activityLimit],
        )
      ).rows as ActivityRow[];

      const logins = await readAccountLogins(sql, [
        ...trendingRows.map((row) => ({
          id: row.owner_account_id,
          kind: row.owner_account_kind,
        })),
        ...activityRows.flatMap((row) => [
          { id: row.owner_account_id, kind: row.owner_account_kind },
          { id: row.actor, kind: "USER" as const },
        ]),
      ]);
      const loginByAccount = new Map(
        logins.map((login) => [accountKey(login.id, login.kind), login.login]),
      );

      const trending: TrendingRepository[] = trendingRows.map((row) => {
        const ownerLogin = loginByAccount.get(
          accountKey(row.owner_account_id, row.owner_account_kind),
        );
        if (!ownerLogin) throw new IssueError(409, "Repository owner locator 不可用。");
        return {
          id: row.id,
          ownerLogin,
          name: row.name,
          visibility: row.visibility,
          capability: row.capability,
          recentStarCount: Number(row.recent_star_count),
          starCount: Number(row.star_count),
          starred: Boolean(row.starred),
        };
      });

      const activity: RepositoryActivityItem[] = activityRows.map((row) => {
        const ownerLogin = loginByAccount.get(
          accountKey(row.owner_account_id, row.owner_account_kind),
        );
        if (!ownerLogin) throw new IssueError(409, "Repository owner locator 不可用。");
        const actorLogin = loginByAccount.get(accountKey(row.actor, "USER"));
        if (!actorLogin) throw new IssueError(409, "Repository activity actor locator 不可用。");
        return {
          id: `${row.issue_id}:${row.version}`,
          occurredAt: Number(row.at),
          actorLogin,
          action: row.action,
          repository: {
            id: row.repository_id,
            ownerLogin,
            name: row.repository_name,
          },
          issue: {
            number: Number(row.number),
            title: row.title,
          },
        };
      });

      return { trending, activity };
    });
  }
}
