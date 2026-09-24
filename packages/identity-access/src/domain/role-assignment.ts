export type GovernanceScopeKind = "enterprise" | "organization" | "organization-team";
export type GovernancePrincipalKind = "user" | "organization-team";

export type GovernancePrincipal = Readonly<{
  kind: GovernancePrincipalKind;
  id: string;
}>;

export const governanceRoleDefinitions = {
  EnterpriseOwner: {
    scopeKind: "enterprise",
    principalKinds: ["user"],
    permissions: [
      "enterprise.read",
      "enterprise.manage-members",
      "enterprise.manage-owners",
      "enterprise.manage-organizations",
      "enterprise.deactivate",
    ],
  },
  OrganizationOwner: {
    scopeKind: "organization",
    principalKinds: ["user"],
    permissions: [
      "organization.read",
      "organization.manage-members",
      "organization.manage-owners",
      "organization.manage-lifecycle",
    ],
  },
  TeamMaintainer: {
    scopeKind: "organization-team",
    principalKinds: ["user"],
    permissions: ["organization-team.read", "organization-team.manage-members"],
  },
} as const;

export type GovernanceRole = keyof typeof governanceRoleDefinitions;

export type ScopedRoleCommand = Readonly<{
  action: "grant" | "revoke";
  requestId: string;
  scopeKind: GovernanceScopeKind;
  scopeId: string;
  principal: GovernancePrincipal;
  role: GovernanceRole;
  expectedVersion: number;
  reason: string;
}>;

export class GovernanceAccessError extends Error {
  constructor(
    public readonly status: number,
    public readonly code:
      | "invalid-input"
      | "not-found"
      | "forbidden"
      | "inactive"
      | "invalid-transition"
      | "last-effective-role-holder"
      | "conflict"
      | "stale-version"
      | "scope-conflict"
      | "consent-required"
      | "replay-conflict"
      | "unknown-result",
    message: string,
  ) {
    super(message);
    this.name = "GovernanceAccessError";
  }
}

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const stableId = /^[\w-]{1,128}$/;

export function roleSupportsAssignment(
  role: GovernanceRole,
  scopeKind: GovernanceScopeKind,
  principalKind: GovernancePrincipalKind,
): boolean {
  const definition = governanceRoleDefinitions[role];
  return (
    definition.scopeKind === scopeKind &&
    (definition.principalKinds as readonly GovernancePrincipalKind[]).includes(principalKind)
  );
}

export function parseScopedRoleCommand(raw: unknown): ScopedRoleCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new GovernanceAccessError(400, "invalid-input", "角色操作格式不正確。");
  }
  const value = raw as Record<string, unknown>;
  const allowed = [
    "action",
    "requestId",
    "scopeKind",
    "scopeId",
    "principal",
    "role",
    "expectedVersion",
    "reason",
  ];
  const principal = value.principal as Record<string, unknown> | null;
  const principalAllowed = ["kind", "id"];
  if (
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    (value.action !== "grant" && value.action !== "revoke") ||
    typeof value.requestId !== "string" ||
    !uuid.test(value.requestId) ||
    (value.scopeKind !== "enterprise" &&
      value.scopeKind !== "organization" &&
      value.scopeKind !== "organization-team") ||
    typeof value.scopeId !== "string" ||
    !stableId.test(value.scopeId) ||
    !principal ||
    typeof principal !== "object" ||
    Array.isArray(principal) ||
    Object.keys(principal).some((key) => !principalAllowed.includes(key)) ||
    (principal.kind !== "user" && principal.kind !== "organization-team") ||
    typeof principal.id !== "string" ||
    !stableId.test(principal.id) ||
    typeof value.role !== "string" ||
    !Object.hasOwn(governanceRoleDefinitions, value.role) ||
    !roleSupportsAssignment(
      value.role as GovernanceRole,
      value.scopeKind as GovernanceScopeKind,
      principal.kind as GovernancePrincipalKind,
    ) ||
    typeof value.expectedVersion !== "number" ||
    !Number.isSafeInteger(value.expectedVersion) ||
    value.expectedVersion < 0 ||
    typeof value.reason !== "string" ||
    !value.reason.trim() ||
    value.reason.trim().length > 500
  ) {
    throw new GovernanceAccessError(400, "invalid-input", "請核對角色、範圍、主體、版本與原因。");
  }
  return {
    action: value.action,
    requestId: value.requestId.toLowerCase(),
    scopeKind: value.scopeKind,
    scopeId: value.scopeId,
    principal: {
      kind: principal.kind,
      id: principal.id,
    } as GovernancePrincipal,
    role: value.role as GovernanceRole,
    expectedVersion: value.expectedVersion,
    reason: value.reason.trim(),
  };
}
