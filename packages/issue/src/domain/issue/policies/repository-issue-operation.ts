import type { RepositoryPermission } from "@line_bot_v1/repository/domain";

/**
 * The local create and transition commands both manage assigned work. READ's FPT open/comment
 * abilities do not authorize these commands, and this explicit set does not imply a total order.
 */
const issueWorkManagementPermissions = new Set<RepositoryPermission>([
  "triage",
  "triage_plus",
  "write",
  "maintain",
  "admin",
]);

export function canManageIssueWork(permissions: readonly RepositoryPermission[]): boolean {
  return permissions.some((permission) => issueWorkManagementPermissions.has(permission));
}
