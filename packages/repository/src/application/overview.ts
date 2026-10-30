import type { RepositoryOverview } from "../contracts/overview.js";

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
