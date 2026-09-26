import {
  readAccountLogins,
  readActiveUserQualification,
} from "@line-work/account/adapters/postgres";
import { businessDatabase, type Database } from "@line-work/platform/adapters/postgres";
import type {
  RepositoryActivityItem,
  RepositoryDiscoveryOptions,
  RepositoryDiscoverySnapshot,
  RepositoryDiscoveryStore,
  RepositoryStarListDiscovery,
  TrendingRepository,
} from "../../application/ports/discovery.js";
import { IssueError, type RepositoryCapability } from "../../domain.js";
import {
  readVisibleStarListRepositoryRows,
  type VisibleStarListRepositoryRow,
} from "./star-list-reads.js";

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

type PublishedListRow = {
  id: string;
  owner_user_id: string;
  name: string;
  description: string;
  updated_at: number | string;
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

  publishedStarLists(userId: string, limit: number): Promise<RepositoryStarListDiscovery[]> {
    return this.db.transaction(async (sql) => {
      if (limit < 1) return [];
      const selected: PublishedListRow[] = [];
      const visibleByList = new Map<string, VisibleStarListRepositoryRow[]>();
      let cursorAt: number | null = null;
      let cursorId = "";
      const pageSize = Math.max(1, limit);

      while (selected.length < limit) {
        const rows = (
          await sql.query(
            `SELECT id,owner_user_id,name,description,updated_at
             FROM repository_star_lists
             WHERE visibility='public'
               AND (
                 $1::bigint IS NULL
                 OR updated_at<$1
                 OR (updated_at=$1 AND id>$2)
               )
             ORDER BY updated_at DESC,id
             LIMIT $3`,
            [cursorAt, cursorId, pageSize],
          )
        ).rows as PublishedListRow[];
        if (!rows.length) break;

        const visibleRows = await readVisibleStarListRepositoryRows(
          sql,
          userId,
          rows.map((row) => row.id),
        );
        for (const repository of visibleRows) {
          const items = visibleByList.get(repository.list_id) ?? [];
          items.push(repository);
          visibleByList.set(repository.list_id, items);
        }

        for (const row of rows) {
          if (!visibleByList.get(row.id)?.length) continue;
          if (!(await readActiveUserQualification(sql, row.owner_user_id))) continue;
          selected.push(row);
          if (selected.length === limit) break;
        }

        const last = rows.at(-1);
        if (!last || rows.length < pageSize) break;
        cursorAt = Number(last.updated_at);
        cursorId = last.id;
      }

      const accounts = await readAccountLogins(sql, [
        ...selected.map((row) => ({ id: row.owner_user_id, kind: "USER" as const })),
        ...selected.flatMap((row) =>
          (visibleByList.get(row.id) ?? []).map((repository) => ({
            id: repository.owner_account_id,
            kind: repository.owner_account_kind,
          })),
        ),
      ]);
      const loginByAccount = new Map(
        accounts.map((account) => [accountKey(account.id, account.kind), account.login]),
      );

      return selected.map((row) => {
        const ownerLogin = loginByAccount.get(accountKey(row.owner_user_id, "USER"));
        if (!ownerLogin) throw new IssueError(409, "List owner locator 不可用。");
        const repositories = visibleByList.get(row.id) ?? [];
        return {
          id: row.id,
          ownerLogin,
          name: row.name,
          description: row.description,
          visibleRepositoryCount: repositories.length,
          updatedAt: Number(row.updated_at),
          repositories: repositories.slice(0, 3).map((repository) => {
            const repositoryOwnerLogin = loginByAccount.get(
              accountKey(repository.owner_account_id, repository.owner_account_kind),
            );
            if (!repositoryOwnerLogin) {
              throw new IssueError(409, "Repository owner locator 不可用。");
            }
            return {
              id: repository.repository_id,
              ownerLogin: repositoryOwnerLogin,
              name: repository.repository_name,
            };
          }),
        };
      });
    });
  }

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
