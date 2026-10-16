import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { resolveAccountLogin, resolveScopedName } from "@line_bot_v1/namespace/postgres";
import { readOrganizationQualification } from "@line_bot_v1/organization/postgres";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import { numericValue, stringValue } from "@line_bot_v1/platform/validation";
import type {
  PopularPublicRepositoryList,
  PublicRepository,
  PublicRepositoryList,
  PublicRepositoryStore,
} from "../contracts/output/public.js";

async function qualifiedOwner(sql: Sql, ownerLogin: string) {
  const owner = await resolveAccountLogin(sql, ownerLogin);
  if (!owner) return null;
  if (owner.kind === "USER") {
    if (!(await readActiveUserQualification(sql, owner.id))) return null;
  } else {
    const organization = await readOrganizationQualification(sql, owner.id);
    if (!organization || organization.status !== "active") return null;
  }
  return owner;
}

export class PostgresPublicRepositoryStore implements PublicRepositoryStore {
  constructor(private db: Database = businessDatabase()) {}

  byOwnerAndName(
    ownerLogin: string,
    name: string,
    followRenames = true,
  ): Promise<PublicRepository | null> {
    return this.db.transaction(async (sql) => {
      const owner = await qualifiedOwner(sql, ownerLogin);
      if (!owner) return null;
      const binding = await resolveScopedName(
        sql,
        { family: "repository-name", scopeKind: "OWNER_ACCOUNT", scopeId: owner.id },
        name,
      );
      if (!binding || (binding.alias && !followRenames)) return null;
      const repository = (
        await sql.query(
          `SELECT id,name FROM repositories
           WHERE id=$1 AND owner_account_id=$2 AND owner_account_kind=$3
             AND visibility='public'`,
          [binding.targetId, owner.id, owner.kind],
          (row) => ({ id: stringValue(row.id), name: stringValue(row.name) }),
        )
      ).rows[0];
      return repository ? { ...repository, ownerLogin: owner.login } : null;
    });
  }

  listByOwner(ownerLogin: string, limit: number): Promise<PublicRepositoryList> {
    return this.db.transaction(async (sql) => {
      const owner = await qualifiedOwner(sql, ownerLogin);
      if (!owner) return { items: [], totalCount: 0 };
      const rows = (
        await sql.query(
          `SELECT id,name,count(*) OVER()::int AS total_count
           FROM repositories
           WHERE owner_account_id=$1 AND owner_account_kind=$2
             AND visibility='public'
           ORDER BY lower(name),id
           LIMIT $3`,
          [owner.id, owner.kind, limit],
          (row) => ({
            id: stringValue(row.id),
            name: stringValue(row.name),
            total_count: numericValue(row.total_count),
          }),
        )
      ).rows;
      return {
        items: rows.map((row) => ({ id: row.id, ownerLogin: owner.login, name: row.name })),
        totalCount: rows[0] ? Number(rows[0].total_count) : 0,
      };
    });
  }

  popularByOwner(ownerLogin: string, limit: number): Promise<PopularPublicRepositoryList> {
    return this.db.transaction(async (sql) => {
      const owner = await qualifiedOwner(sql, ownerLogin);
      if (!owner) return { items: [], totalCount: 0 };
      const rows = (
        await sql.query(
          `SELECT r.id,r.name,count(s.user_id)::int AS star_count,
                  count(*) OVER()::int AS total_count
           FROM repositories r
           LEFT JOIN repository_stars s ON s.repository_id=r.id
           WHERE r.owner_account_id=$1 AND r.owner_account_kind=$2
             AND r.visibility='public'
           GROUP BY r.id,r.name
           ORDER BY count(s.user_id) DESC,lower(r.name),r.id
           LIMIT $3`,
          [owner.id, owner.kind, limit],
          (row) => ({
            id: stringValue(row.id),
            name: stringValue(row.name),
            star_count: numericValue(row.star_count),
            total_count: numericValue(row.total_count),
          }),
        )
      ).rows;
      return {
        items: rows.map((row) => ({
          id: row.id,
          ownerLogin: owner.login,
          name: row.name,
          starCount: Number(row.star_count),
        })),
        totalCount: rows[0] ? Number(rows[0].total_count) : 0,
      };
    });
  }
}
