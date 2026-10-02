import { type RepositoryPermission, repositoryPermissions } from "@line_bot_v1/repository/domain";

type IssueRepositoryOperation =
  | "read"
  | "open"
  | "comment"
  | "workflow"
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
const conversationManagementPermissions: readonly RepositoryPermission[] = [
  "write",
  "maintain",
  "admin",
];

const issueRepositoryOperationPermissions: Readonly<
  Record<IssueRepositoryOperation, readonly RepositoryPermission[]>
> = {
  read: allRepositoryPermissions,
  open: allRepositoryPermissions,
  comment: allRepositoryPermissions,
  workflow: allRepositoryPermissions,
  triage: issueManagementPermissions,
  edit: issueManagementPermissions,
  close: issueManagementPermissions,
  assign: issueManagementPermissions,
  "manage-resource": deferredPermissions,
  "lock-conversation": conversationManagementPermissions,
};

export function canIssueRepositoryOperation(
  permissions: readonly RepositoryPermission[],
  operation: IssueRepositoryOperation,
): boolean {
  const allowed = issueRepositoryOperationPermissions[operation];
  return permissions.some((permission) => allowed.includes(permission));
}
