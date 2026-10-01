import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { readAccountLogins } from "@line_bot_v1/namespace/postgres";
import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import type {
  RepositoryDiscoveryOptions,
  RepositoryDiscoverySnapshot,
  RepositoryDiscoveryStore,
  RepositoryStarListDiscovery,
  TrendingRepository,
} from "../../contracts/discovery.js";
import { type RepositoryCapability, RepositoryError } from "../../domain.js";
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
        if (!ownerLogin) throw new RepositoryError(409, "List owner locator 不可用。");
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
              throw new RepositoryError(409, "Repository owner locator 不可用。");
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

      const logins = await readAccountLogins(
        sql,
        trendingRows.map((row) => ({
          id: row.owner_account_id,
          kind: row.owner_account_kind,
        })),
      );
      const loginByAccount = new Map(
        logins.map((login) => [accountKey(login.id, login.kind), login.login]),
      );

      const trending: TrendingRepository[] = trendingRows.map((row) => {
        const ownerLogin = loginByAccount.get(
          accountKey(row.owner_account_id, row.owner_account_kind),
        );
        if (!ownerLogin) throw new RepositoryError(409, "Repository owner locator 不可用。");
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

      return { trending };
    });
  }
}
