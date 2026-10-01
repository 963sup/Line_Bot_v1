import type { RepositoryPermission } from "@line_bot_v1/repository/domain";

export type IssueRepositoryOperation =
  | "read"
  | "open"
  | "comment"
  | "triage"
  | "edit"
  | "close"
  | "assign"
  | "manage-resource";

export type IssueCreationPolicy = "all" | "collaborators_only";

const allIssuePermissions = new Set<RepositoryPermission>([
  "read",
  "triage",
  "triage_plus",
  "write",
  "maintain",
  "admin",
]);

const issueManagementPermissions = new Set<RepositoryPermission>([
  "triage",
  "triage_plus",
  "write",
  "maintain",
  "admin",
]);

const noIssuePermissions = new Set<RepositoryPermission>();

const operationPermissions: Readonly<
  Record<IssueRepositoryOperation, ReadonlySet<RepositoryPermission>>
> = {
  read: allIssuePermissions,
  open: allIssuePermissions,
  comment: allIssuePermissions,
  triage: issueManagementPermissions,
  edit: issueManagementPermissions,
  close: issueManagementPermissions,
  assign: issueManagementPermissions,
  "manage-resource": noIssuePermissions,
};

/**
 * Maps exact RepositoryPermission facts to GitHub FPT Issue abilities. The map is operation-based:
 * it does not create a numeric permission rank and does not grant Repository-owned resource policy.
 */
export function canUseIssueOperation(
  permissions: readonly RepositoryPermission[],
  operation: IssueRepositoryOperation,
): boolean {
  const allowed = operationPermissions[operation];
  return permissions.some((permission) => allowed.has(permission));
}

/**
 * Public visibility is a Repository-owned input fact. It can make the generic Issue read scope
 * visible without manufacturing a RepositoryPermission; private scope still requires current access.
 */
export function canReadIssueScope(input: {
  repositoryPublic: boolean;
  permissions: readonly RepositoryPermission[];
}): boolean {
  return input.repositoryPublic || canUseIssueOperation(input.permissions, "read");
}

/**
 * Generic Issue opening is distinct from the current assigned-work create command. An ALL creation
 * policy can admit a qualified actor on a public Repository; COLLABORATORS_ONLY still requires the
 * Repository-owned collaborator fact. Private scope never becomes readable through this policy.
 */
export function canOpenIssue(input: {
  repositoryPublic: boolean;
  permissions: readonly RepositoryPermission[];
  actorQualified: boolean;
  actorIsCollaborator: boolean;
  creationPolicy: IssueCreationPolicy;
}): boolean {
  if (!input.actorQualified || !canReadIssueScope(input)) return false;
  if (input.actorIsCollaborator) {
    return canUseIssueOperation(input.permissions, "open");
  }
  return input.repositoryPublic && input.creationPolicy === "all";
}

/**
 * Generic comments require a qualified actor, an unlocked conversation, readable scope and the
 * FPT comment ability. No lock override is inferred from RepositoryPermission.
 */
export function canCommentOnIssue(input: {
  repositoryPublic: boolean;
  permissions: readonly RepositoryPermission[];
  actorQualified: boolean;
  conversationLocked: boolean;
}): boolean {
  return (
    input.actorQualified &&
    !input.conversationLocked &&
    canReadIssueScope(input) &&
    canUseIssueOperation(input.permissions, "comment")
  );
}

/**
 * The current create and transition commands manage assigned work. Create combines open + assign,
 * so READ's generic open/comment abilities intentionally do not authorize this composite command.
 */
export function canManageIssueWork(permissions: readonly RepositoryPermission[]): boolean {
  return canUseIssueOperation(permissions, "assign");
}
