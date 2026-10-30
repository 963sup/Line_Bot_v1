import {
  hasRepositoryPermission,
  type RepositoryPermission,
} from "../domain/repository/value-objects/repository-capability.js";

/** Current scope projection; commands must still recheck access in their transaction. */
export function repositoryOwnerCapabilities(
  permissions: readonly RepositoryPermission[],
  archived: boolean,
) {
  return {
    canEdit:
      !archived &&
      (hasRepositoryPermission(permissions, "write") ||
        hasRepositoryPermission(permissions, "maintain") ||
        hasRepositoryPermission(permissions, "admin")),
    canManage: !archived && hasRepositoryPermission(permissions, "admin"),
  };
}
