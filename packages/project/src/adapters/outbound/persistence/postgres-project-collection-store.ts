import { readAccountLogins } from "@line_bot_v1/namespace/postgres";
import { readOrganizationOwnerScopeIds } from "@line_bot_v1/organization/postgres";
import type { Database } from "@line_bot_v1/platform/postgres";
import type { ProjectSummary } from "../../../contracts/dto/project-collection.js";
import type { ProjectCollectionStore } from "../../../contracts/repositories/project-collection-store.js";
import type { ProjectOwnerKind } from "../../../domain/value-objects/project-owner-kind.js";

export class PostgresProjectCollectionStore implements ProjectCollectionStore {
  constructor(private readonly db: Database) {}

  accessible(userId: string): Promise<readonly ProjectSummary[]> {
    return this.db.transaction(async (sql) => {
      const organizationOwnerIds = await readOrganizationOwnerScopeIds(sql, userId);
      const rows = (
        await sql.query(
          `SELECT id,owner_account_id,owner_account_kind,name,version
           FROM projects
           WHERE (owner_account_kind='USER' AND owner_account_id=$1)
              OR (owner_account_kind='ORGANIZATION' AND owner_account_id=ANY($2::text[]))
           ORDER BY lower(name),id`,
          [userId, organizationOwnerIds],
        )
      ).rows as Array<{
        id: string;
        owner_account_id: string;
        owner_account_kind: ProjectOwnerKind;
        name: string;
        version: number;
      }>;

      const owners = await readAccountLogins(
        sql,
        rows.map((row) => ({ id: row.owner_account_id, kind: row.owner_account_kind })),
      );
      const ownerLogins = new Map(
        owners.map((owner) => [`${owner.id}:\0:${owner.kind}`, owner.login] as const),
      );

      return rows.flatMap((row) => {
        const ownerLogin = ownerLogins.get(`${row.owner_account_id}:\0:${row.owner_account_kind}`);
        return ownerLogin
          ? [
              {
                id: row.id,
                ownerLogin,
                ownerKind: row.owner_account_kind,
                name: row.name,
                version: Number(row.version),
              },
            ]
          : [];
      });
    });
  }
}
