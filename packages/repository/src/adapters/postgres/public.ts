import {
  readActiveUserQualification,
  resolveAccountLogin,
} from "@line-work/account/adapters/postgres";
import { readOrganizationQualification } from "@line-work/organization/adapters/postgres";
import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";
import type {
  PublicRepository,
  PublicRepositoryList,
  PublicRepositoryStore,
} from "../../application/ports/public.js";

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

  byOwnerAndName(ownerLogin: string, name: string): Promise<PublicRepository | null> {
    return this.db.transaction(async (sql) => {
      const owner = await qualifiedOwner(sql, ownerLogin);
      if (!owner) return null;
      const row = (
        await sql.query(
          `SELECT id,name FROM repositories
           WHERE owner_account_id=$1 AND owner_account_kind=$2
             AND lower(name)=lower($3) AND visibility='public'`,
          [owner.id, owner.kind, name],
        )
      ).rows[0] as { id: string; name: string } | undefined;
      return row ? { ...row, ownerLogin: owner.login } : null;
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
        )
      ).rows as Array<{ id: string; name: string; total_count: number | string }>;
      return {
        items: rows.map((row) => ({ id: row.id, ownerLogin: owner.login, name: row.name })),
        totalCount: rows[0] ? Number(rows[0].total_count) : 0,
      };
    });
  }
}
