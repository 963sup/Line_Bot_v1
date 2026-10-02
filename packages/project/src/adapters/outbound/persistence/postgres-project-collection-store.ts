import { readAccountLogins } from "@line_bot_v1/namespace/postgres";
import { readOrganizationOwnerScopeIds } from "@line_bot_v1/organization/postgres";
import type { Database } from "@line_bot_v1/platform/postgres";
import { readActiveProjectTeamIds } from "@line_bot_v1/team/postgres/project-access";
import type { ProjectSummary } from "../../../contracts/dto/project-collection.js";
import type { ProjectCollectionStore } from "../../../contracts/repositories/project-collection-store.js";
import type {
  ProjectAccessRole,
  ProjectOwnerKind,
} from "../../../domain.js";

const roleRank: Readonly<Record<ProjectAccessRole, number>> = {
  READ: 1,
  WRITE: 2,
  ADMIN: 3,
};

function effectiveRole(
  values: readonly ProjectAccessRole[],
): ProjectAccessRole {
  let best: ProjectAccessRole = "READ";
  for (const value of values) {
    if (roleRank[value] > roleRank[best]) best = value;
  }
  return best;
}

export class PostgresProjectCollectionStore implements ProjectCollectionStore {
  constructor(private readonly db: Database) {}

  accessible(userId: string): Promise<readonly ProjectSummary[]> {
    return this.db.transaction(async (sql) => {
      const [organizationOwnerIds, teamIds] = await Promise.all([
        readOrganizationOwnerScopeIds(sql, userId),
        readActiveProjectTeamIds(sql, userId),
      ]);
      const rows = (
        await sql.query(
          `SELECT
             p.id,
             p.owner_account_id,
             p.owner_account_kind,
             p.number,
             p.name,
             p.is_public,
             p.closed,
             p.version,
             ua.role AS user_role,
             COALESCE(
               (
                 SELECT array_agg(ta.role ORDER BY ta.role)
                 FROM project_team_access ta
                 WHERE ta.project_id=p.id
                   AND ta.team_id=ANY($3::text[])
               ),
               ARRAY[]::text[]
             ) AS team_roles
           FROM projects p
           LEFT JOIN project_user_access ua
             ON ua.project_id=p.id
            AND ua.user_id=$1
           WHERE p.deleted_at IS NULL
             AND (
               p.is_public
               OR (p.owner_account_kind='USER' AND p.owner_account_id=$1)
               OR (
                 p.owner_account_kind='ORGANIZATION'
                 AND p.owner_account_id=ANY($2::text[])
               )
               OR ua.user_id IS NOT NULL
               OR EXISTS (
                 SELECT 1
                 FROM project_team_access ta
                 WHERE ta.project_id=p.id
                   AND ta.team_id=ANY($3::text[])
               )
             )
           ORDER BY lower(p.name),p.id`,
          [userId, organizationOwnerIds, teamIds],
        )
      ).rows as Array<{
        id: string;
        owner_account_id: string;
        owner_account_kind: ProjectOwnerKind;
        number: number | string | null;
        name: string;
        is_public: boolean;
        closed: boolean;
        version: number | string;
        user_role: ProjectAccessRole | null;
        team_roles: ProjectAccessRole[];
      }>;

      const owners = await readAccountLogins(
        sql,
        rows.map((row) => ({
          id: row.owner_account_id,
          kind: row.owner_account_kind,
        })),
      );
      const ownerLogins = new Map(
        owners.map((owner) => [
          `${owner.id}:\0:${owner.kind}`,
          owner.login,
        ] as const),
      );

      return rows.flatMap((row) => {
        const ownerLogin = ownerLogins.get(
          `${row.owner_account_id}:\0:${row.owner_account_kind}`,
        );
        if (!ownerLogin) return [];

        const roles: ProjectAccessRole[] = [];
        if (row.is_public) roles.push("READ");
        if (
          (row.owner_account_kind === "USER" &&
            row.owner_account_id === userId) ||
          (row.owner_account_kind === "ORGANIZATION" &&
            organizationOwnerIds.includes(row.owner_account_id))
        ) {
          roles.push("ADMIN");
        }
        if (row.user_role) roles.push(row.user_role);
        roles.push(...row.team_roles);
        if (!roles.length) return [];

        return [
          {
            id: row.id,
            ownerLogin,
            ownerKind: row.owner_account_kind,
            number: row.number === null ? null : Number(row.number),
            name: row.name,
            public: row.is_public,
            closed: row.closed,
            role: effectiveRole(roles),
            version: Number(row.version),
          },
        ];
      });
    });
  }
}
