import { normalizeAccountLogin } from "@line-work/account/domain/login";
import type {
  GovernanceQuery,
  VerifiedLineActor,
} from "@line-work/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line-work/identity-access/domain/role-assignment";

const governanceUuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const governanceId = /^[\w-]{1,128}$/;

function governanceInput(raw: unknown, allowed: string[]) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new GovernanceAccessError(400, "invalid-input", "治理操作格式不正確。");
  }
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new GovernanceAccessError(400, "invalid-input", "治理操作含有未知欄位。");
  }
  return value;
}

function requireExactGovernanceKeys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new GovernanceAccessError(400, "invalid-input", "治理操作欄位與動作不符。");
  }
}

function parseMutationEvidence(value: Record<string, unknown>) {
  if (
    typeof value.requestId !== "string" ||
    !governanceUuid.test(value.requestId) ||
    typeof value.reason !== "string" ||
    !value.reason.trim() ||
    value.reason.trim().length > 500
  ) {
    throw new GovernanceAccessError(400, "invalid-input", "請核對請求編號與操作原因。");
  }
  return { requestId: value.requestId.toLowerCase(), reason: value.reason.trim() };
}

function parseId(value: unknown, name: string) {
  if (typeof value !== "string" || !governanceId.test(value)) {
    throw new GovernanceAccessError(400, "invalid-input", `${name} 不正確。`);
  }
  return value;
}

function parseVersion(value: unknown, name: string, allowZero = false) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new GovernanceAccessError(400, "invalid-input", `${name}版本不正確。`);
  }
  return value;
}

import type { OrganizationCommand } from "../contracts/organization-governance.js";
import type { OrganizationGovernancePort } from "./ports/organization-governance.js";

function parseOrganizationCommand(raw: unknown): OrganizationCommand {
  const base = governanceInput(raw, [
    "action",
    "requestId",
    "organizationAccountId",
    "login",
    "name",
    "targetUserId",
    "expectedVersion",
    "reason",
  ]);
  const evidence = parseMutationEvidence(base);
  if (base.action === "create-organization") {
    requireExactGovernanceKeys(base, ["action", "requestId", "login", "name", "reason"]);
    if (
      typeof base.login !== "string" ||
      typeof base.name !== "string" ||
      !base.name.trim() ||
      base.name.trim().length > 120
    ) {
      throw new GovernanceAccessError(400, "invalid-input", "Organization login 或 name 不正確。");
    }
    try {
      return {
        ...evidence,
        action: base.action,
        login: normalizeAccountLogin(base.login),
        name: base.name.trim(),
      };
    } catch {
      throw new GovernanceAccessError(400, "invalid-input", "Organization login 不正確或已保留。");
    }
  }
  const organizationAccountId = parseId(base.organizationAccountId, "Organization");

  if (base.action === "deactivate" || base.action === "reactivate") {
    requireExactGovernanceKeys(base, [
      "action",
      "requestId",
      "organizationAccountId",
      "expectedVersion",
      "reason",
    ]);
    return {
      ...evidence,
      action: base.action,
      organizationAccountId,
      expectedVersion: parseVersion(base.expectedVersion, "Organization"),
    };
  }

  if (base.action === "leave-organization") {
    requireExactGovernanceKeys(base, [
      "action",
      "requestId",
      "organizationAccountId",
      "expectedVersion",
      "reason",
    ]);
    return {
      ...evidence,
      action: base.action,
      organizationAccountId,
      expectedVersion: parseVersion(base.expectedVersion, "Organization direct membership"),
    };
  }

  if (
    base.action !== "invite-member" &&
    base.action !== "accept-invitation" &&
    base.action !== "decline-invitation" &&
    base.action !== "cancel-invitation" &&
    base.action !== "remove-direct-membership"
  ) {
    throw new GovernanceAccessError(400, "invalid-input", "不支援此 Organization 操作。");
  }
  requireExactGovernanceKeys(base, [
    "action",
    "requestId",
    "organizationAccountId",
    "targetUserId",
    "expectedVersion",
    "reason",
  ]);
  return {
    ...evidence,
    action: base.action,
    organizationAccountId,
    targetUserId: parseId(base.targetUserId, "使用者"),
    expectedVersion: parseVersion(
      base.expectedVersion,
      base.action === "remove-direct-membership"
        ? "Organization direct membership"
        : "Organization invitation",
      base.action === "invite-member",
    ),
  };
}

export function organizationGovernance(
  port: OrganizationGovernancePort,
  clock: () => number = Date.now,
) {
  return {
    list(actor: VerifiedLineActor, query: GovernanceQuery = {}) {
      return port.list(actor, query);
    },
    detail(actor: VerifiedLineActor, organizationAccountId: string) {
      return port.detail(actor, parseId(organizationAccountId, "Organization"));
    },
    execute(actor: VerifiedLineActor, raw: unknown) {
      return port.execute(actor, parseOrganizationCommand(raw), clock());
    },
  };
}
