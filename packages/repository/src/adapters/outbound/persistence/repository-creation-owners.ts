import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { readAccountLogin } from "@line_bot_v1/namespace/postgres";
import {
  listOrganizationRepositoryCreationScopeIds,
  readOrganizationViewerCapabilities,
} from "@line_bot_v1/organization/postgres";
import type { Database } from "@line_bot_v1/platform/postgres";
import type { RepositoryOwnerOption } from "../../../contracts/input/repository-creation.js";
import { RepositoryError } from "../../../contracts/repository.js";

export class PostgresRepositoryCreationOwnersQuery {
  constructor(private readonly db: Database) {}

  owners(userId: string): Promise<readonly RepositoryOwnerOption[]> {
    return this.db.transaction(async (sql) => {
      const actor = await readActiveUserQualification(sql, userId, "share");
      if (!actor) throw new RepositoryError(403, "目前 User 資格不能建立 Repository。");
      const personal = await readAccountLogin(sql, userId, "USER");
      if (!personal) throw new RepositoryError(409, "目前 User login 不可用。");

      const organizations: RepositoryOwnerOption[] = [];
      for (const id of await listOrganizationRepositoryCreationScopeIds(sql, userId)) {
        const capabilities = await readOrganizationViewerCapabilities(sql, userId, id);
        if (!capabilities) continue;
        const locator = await readAccountLogin(sql, id, "ORGANIZATION");
        if (!locator) throw new RepositoryError(409, "Organization login 不可用。");
        const internalEligible = Boolean(
          (
            await sql.query(
              "SELECT 1 FROM repository_internal_scopes WHERE organization_account_id=$1 LIMIT 1",
              [id],
            )
          ).rows[0],
        );
        organizations.push({
          id,
          kind: "ORGANIZATION",
          login: locator.login,
          internalEligible,
          creatableVisibilities: (["private", "public", "internal"] as const).filter(
            (visibility) =>
              capabilities.viewerCanCreateRepositoryVisibilities[visibility] &&
              (visibility !== "internal" || internalEligible),
          ),
        });
      }
      organizations.sort((left, right) => left.login.localeCompare(right.login));
      return [
        {
          id: userId,
          kind: "USER" as const,
          login: personal.login,
          internalEligible: false,
          creatableVisibilities: ["private", "public"] as const,
        },
        ...organizations.filter((organization) => organization.creatableVisibilities.length > 0),
      ];
    });
  }
}
