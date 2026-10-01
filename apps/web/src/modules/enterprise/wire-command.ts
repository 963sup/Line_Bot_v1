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

export function normalizeEnterpriseWireCommand(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const value = raw as Record<string, unknown>;
  if (
    !hasExactKeys(value, legacyKeys) ||
    (value.action !== "grant" && value.action !== "revoke") ||
    value.scopeKind !== "enterprise" ||
    value.role !== "EnterpriseOwner" ||
    !value.principal ||
    typeof value.principal !== "object" ||
    Array.isArray(value.principal)
  ) {
    return raw;
  }
  const principal = value.principal as Record<string, unknown>;
  if (
    !hasExactKeys(principal, ["kind", "id"]) ||
    principal.kind !== "user"
  ) {
    return raw;
  }
  return {
    action:
      value.action === "grant" ? "grant-enterprise-owner" : "revoke-enterprise-owner",
    requestId: value.requestId,
    enterpriseAccountId: value.scopeId,
    targetUserId: principal.id,
    expectedVersion: value.expectedVersion,
    reason: value.reason,
  };
}
