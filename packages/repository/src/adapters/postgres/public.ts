import {
  readActiveUserQualification,
  resolveAccountLogin,
} from "@line-work/account/adapters/postgres";
import { readOrganizationQualification } from "@line-work/organization/adapters/postgres";
import { businessDatabase, type Database } from "@line-work/platform/adapters/postgres";
import type { PublicRepository, PublicRepositoryStore } from "../../application/ports/public.js";

export class PostgresPublicRepositoryStore implements PublicRepositoryStore {
  constructor(private db: Database = businessDatabase()) {}

  byOwnerAndName(ownerLogin: string, name: string): Promise<PublicRepository | null> {
    return this.db.transaction(async (sql) => {
      const owner = await resolveAccountLogin(sql, ownerLogin);
      if (!owner) return null;
      if (owner.kind === "USER") {
        if (!(await readActiveUserQualification(sql, owner.id))) return null;
      } else {
        const organization = await readOrganizationQualification(sql, owner.id);
        if (!organization || organization.status !== "active") return null;
      }
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
}
