import { resolveAccountLogin } from "@line-work/account/adapters/postgres";
import { businessDatabase, type Database } from "@line-work/platform/adapters/postgres";
import type {
  OrganizationPublicStore,
  PublicOrganization,
} from "../../application/ports/public.js";

export class PostgresOrganizationPublicStore implements OrganizationPublicStore {
  constructor(private db: Database = businessDatabase()) {}

  byLogin(login: string): Promise<PublicOrganization | null> {
    return this.db.transaction(async (sql) => {
      const owner = await resolveAccountLogin(sql, login);
      if (!owner || owner.kind !== "ORGANIZATION") return null;
      const row = (
        await sql.query(
          `SELECT account_id AS id,name
           FROM organizations
           WHERE account_id=$1 AND status='active'`,
          [owner.id],
        )
      ).rows[0] as { id: string; name: string } | undefined;
      return row ? { ...row, login: owner.login } : null;
    });
  }
}
