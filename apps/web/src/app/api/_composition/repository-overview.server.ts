import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import { createLegacyWbsEntry } from "@line_bot_v1/wbs/application/use-cases/legacy-entry";
import { createPostgresLegacyWbsEntryQuery } from "@line_bot_v1/wbs/composition/bootstrap/legacy-entry";
import type { RepositoryOverview } from "../../../modules/repository/repository-overview";
import { activeLineUser } from "./account.server";

type RepositorySelector = { ownerLogin: string; repositoryName: string };

type OverviewDependencies = Readonly<{
  activeUser(subject: string): Promise<{ id: string }>;
  scope(
    userId: string,
    selector: RepositorySelector,
  ): Promise<{
    repository: Pick<
      RepositoryOverview["repository"],
      "id" | "ownerLogin" | "name" | "permissions"
    >;
    visibility: RepositoryOverview["repository"]["visibility"];
    archived: boolean;
  }>;
  legacy(subject: string, repositoryId: string): Promise<{ entryRequired: boolean }>;
}>;

function statusOf(error: unknown) {
  return error !== null &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : undefined;
}

export function createRepositoryOverviewReader(deps: OverviewDependencies) {
  return async (subject: string, selector: RepositorySelector): Promise<RepositoryOverview> => {
    const actor = await deps.activeUser(subject);
    const scope = await deps.scope(actor.id, selector);
    let legacyStatus: RepositoryOverview["legacyWbs"]["status"];
    try {
      legacyStatus = (await deps.legacy(subject, scope.repository.id)).entryRequired
        ? "available"
        : "none";
    } catch (error) {
      const status = statusOf(error);
      if (status !== undefined && status < 500) throw error;
      legacyStatus = "unavailable";
    }
    return {
      repository: {
        id: scope.repository.id,
        ownerLogin: scope.repository.ownerLogin,
        name: scope.repository.name,
        visibility: scope.visibility,
        archived: scope.archived,
        permissions: scope.repository.permissions,
      },
      legacyWbs: { status: legacyStatus },
    };
  };
}

function productionReader(db: Database = businessDatabase()) {
  const legacy = createLegacyWbsEntry({
    activeUser: activeLineUser,
    query: () => createPostgresLegacyWbsEntryQuery(db),
  });
  return createRepositoryOverviewReader({
    activeUser: activeLineUser,
    scope: (userId, selector) =>
      db.transaction((sql) => repositoryContentScope(sql, userId, selector)),
    legacy: (subject, repositoryId) => legacy.read(subject, { repositoryId }),
  });
}

export function readRepositoryOverview(subject: string, selector: RepositorySelector) {
  return productionReader()(subject, selector);
}
