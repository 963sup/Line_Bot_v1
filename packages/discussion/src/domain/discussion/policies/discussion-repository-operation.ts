import { type RepositoryPermission, repositoryPermissions } from "@line_bot_v1/repository/domain";

type DiscussionRepositoryOperation =
  | "participate"
  | "triage"
  | "manage"
  | "lock-conversation";

const participationPermissions: readonly RepositoryPermission[] = repositoryPermissions;
const triagePermissions: readonly RepositoryPermission[] = [
  "triage",
  "triage_plus",
  "write",
  "maintain",
  "admin",
];
const managementPermissions: readonly RepositoryPermission[] = ["write", "maintain", "admin"];

const permissionsByOperation: Readonly<
  Record<DiscussionRepositoryOperation, readonly RepositoryPermission[]>
> = {
  participate: participationPermissions,
  triage: triagePermissions,
  manage: managementPermissions,
  "lock-conversation": managementPermissions,
};

export function canDiscussionRepositoryOperation(
  permissions: readonly RepositoryPermission[],
  operation: DiscussionRepositoryOperation,
): boolean {
  const allowed = permissionsByOperation[operation];
  return permissions.some((permission) => allowed.includes(permission));
}
