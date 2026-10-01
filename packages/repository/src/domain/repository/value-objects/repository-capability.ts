export const repositoryPermissions = [
  "read",
  "triage",
  "triage_plus",
  "write",
  "maintain",
  "admin",
] as const;

export type RepositoryPermission = (typeof repositoryPermissions)[number];

export function hasRepositoryPermission(
  permissions: readonly RepositoryPermission[],
  permission: RepositoryPermission,
): boolean {
  return permissions.includes(permission);
}
