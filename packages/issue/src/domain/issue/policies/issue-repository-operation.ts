import {
  type RepositoryPermission,
  repositoryPermissions,
} from "@line_bot_v1/repository/domain";

export type IssueRepositoryOperation =
  | "read"
  | "open"
  | "comment"
  | "triage"
  | "edit"
  | "close"
  | "assign"
  | "manage-resource"
  | "lock-conversation";

const allRepositoryPermissions: readonly RepositoryPermission[] = repositoryPermissions;

const issueManagementPermissions: readonly RepositoryPermission[] = [
  "triage",
  "triage_plus",
  "write",
  "maintain",
  "admin",
];

const deferredPermissions: readonly RepositoryPermission[] = [];

export const issueRepositoryOperationPermissions: Readonly<
  Record<IssueRepositoryOperation, readonly RepositoryPermission[]>
> = {
  read: allRepositoryPermissions,
  open: allRepositoryPermissions,
  comment: allRepositoryPermissions,
  triage: issueManagementPermissions,
  edit: issueManagementPermissions,
  close: issueManagementPermissions,
  assign: issueManagementPermissions,
  "manage-resource": deferredPermissions,
  "lock-conversation": deferredPermissions,
};

export function canIssueRepositoryOperation(
  permissions: readonly RepositoryPermission[],
  operation: IssueRepositoryOperation,
): boolean {
  const allowed = issueRepositoryOperationPermissions[operation];
  return permissions.some((permission) => allowed.includes(permission));
}
