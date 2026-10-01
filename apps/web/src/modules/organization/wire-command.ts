const legacyKeys = [
  "action",
  "requestId",
  "scopeKind",
  "scopeId",
  "principal",
  "role",
  "expectedVersion",
  "reason",
] as const;

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

export function normalizeOrganizationWireCommand(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const value = raw as Record<string, unknown>;
  if (
    !hasExactKeys(value, legacyKeys) ||
    (value.action !== "grant" && value.action !== "revoke") ||
    value.scopeKind !== "organization" ||
    value.role !== "OrganizationOwner" ||
    !value.principal ||
    typeof value.principal !== "object" ||
    Array.isArray(value.principal)
  ) {
    return raw;
  }
  const principal = value.principal as Record<string, unknown>;
  if (!hasExactKeys(principal, ["kind", "id"]) || principal.kind !== "user") {
    return raw;
  }
  return {
    action: value.action === "grant" ? "grant-organization-owner" : "revoke-organization-owner",
    requestId: value.requestId,
    organizationAccountId: value.scopeId,
    targetUserId: principal.id,
    expectedVersion: value.expectedVersion,
    reason: value.reason,
  };
}
