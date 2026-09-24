import type {
  GovernanceQuery,
  VerifiedLineActor,
} from "@line-work/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line-work/identity-access/domain/role-assignment";
import { normalizeEnterpriseSlug } from "../domain.js";

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

import type { EnterpriseCommand } from "../contracts/enterprise-governance.js";
import type { EnterpriseGovernancePort } from "./ports/enterprise-governance.js";

function parseTeamName(value: unknown) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length < 1 ||
    value.length > 80
  ) {
    throw new GovernanceAccessError(400, "invalid-input", "Enterprise Team 名稱格式不正確。");
  }
  return value;
}

function parseEnterpriseCommand(raw: unknown): EnterpriseCommand {
  const base = governanceInput(raw, [
    "action",
    "requestId",
    "enterpriseAccountId",
    "slug",
    "organizationAccountId",
    "targetUserId",
    "teamId",
    "name",
    "expectedVersion",
    "expectedEnterpriseVersion",
    "expectedOrganizationVersion",
    "expectedRelationVersion",
    "reason",
  ]);
  const evidence = parseMutationEvidence(base);
  if (base.action === "create-enterprise") {
    requireExactGovernanceKeys(base, ["action", "requestId", "slug", "name", "reason"]);
    if (
      typeof base.slug !== "string" ||
      typeof base.name !== "string" ||
      !base.name.trim() ||
      base.name.trim().length > 120
    ) {
      throw new GovernanceAccessError(400, "invalid-input", "Enterprise slug 或 name 不正確。");
    }
    try {
      return {
        ...evidence,
        action: base.action,
        slug: normalizeEnterpriseSlug(base.slug),
        name: base.name.trim(),
      };
    } catch {
      throw new GovernanceAccessError(400, "invalid-input", "Enterprise slug 不正確。");
    }
  }
  const enterpriseAccountId = parseId(base.enterpriseAccountId, "Enterprise");
  if (base.action === "deactivate" || base.action === "reactivate") {
    requireExactGovernanceKeys(base, [
      "action",
      "requestId",
      "enterpriseAccountId",
      "expectedVersion",
      "reason",
    ]);
    return {
      ...evidence,
      action: base.action,
      enterpriseAccountId,
      expectedVersion: parseVersion(base.expectedVersion, "Enterprise"),
    };
  }
  if (base.action === "leave-enterprise") {
    requireExactGovernanceKeys(base, [
      "action",
      "requestId",
      "enterpriseAccountId",
      "expectedVersion",
      "reason",
    ]);
    return {
      ...evidence,
      action: base.action,
      enterpriseAccountId,
      expectedVersion: parseVersion(base.expectedVersion, "Enterprise direct affiliation"),
    };
  }
  if (
    base.action === "invite-user" ||
    base.action === "accept-invitation" ||
    base.action === "decline-invitation" ||
    base.action === "cancel-invitation" ||
    base.action === "remove-direct-affiliation"
  ) {
    requireExactGovernanceKeys(base, [
      "action",
      "requestId",
      "enterpriseAccountId",
      "targetUserId",
      "expectedVersion",
      "reason",
    ]);
    return {
      ...evidence,
      action: base.action,
      enterpriseAccountId,
      targetUserId: parseId(base.targetUserId, "使用者"),
      expectedVersion: parseVersion(
        base.expectedVersion,
        base.action === "remove-direct-affiliation"
          ? "Enterprise direct affiliation"
          : "Enterprise invitation",
        base.action === "invite-user",
      ),
    };
  }
  if (base.action === "attach-organization" || base.action === "detach-organization") {
    requireExactGovernanceKeys(base, [
      "action",
      "requestId",
      "enterpriseAccountId",
      "organizationAccountId",
      "expectedEnterpriseVersion",
      "expectedOrganizationVersion",
      "expectedRelationVersion",
      "reason",
    ]);
    return {
      ...evidence,
      action: base.action,
      enterpriseAccountId,
      organizationAccountId: parseId(base.organizationAccountId, "Organization"),
      expectedEnterpriseVersion: parseVersion(base.expectedEnterpriseVersion, "Enterprise"),
      expectedOrganizationVersion: parseVersion(base.expectedOrganizationVersion, "Organization"),
      expectedRelationVersion: parseVersion(
        base.expectedRelationVersion,
        "治理關係",
        base.action === "attach-organization",
      ),
    };
  }
  if (base.action === "create-enterprise-team") {
    requireExactGovernanceKeys(base, [
      "action",
      "requestId",
      "enterpriseAccountId",
      "name",
      "reason",
    ]);
    return {
      ...evidence,
      action: base.action,
      enterpriseAccountId,
      name: parseTeamName(base.name),
    };
  }
  if (base.action === "rename-enterprise-team") {
    requireExactGovernanceKeys(base, [
      "action",
      "requestId",
      "enterpriseAccountId",
      "teamId",
      "name",
      "expectedVersion",
      "reason",
    ]);
    return {
      ...evidence,
      action: base.action,
      enterpriseAccountId,
      teamId: parseId(base.teamId, "Enterprise Team"),
      name: parseTeamName(base.name),
      expectedVersion: parseVersion(base.expectedVersion, "Enterprise Team"),
    };
  }
  if (
    base.action === "add-enterprise-team-member" ||
    base.action === "remove-enterprise-team-member"
  ) {
    requireExactGovernanceKeys(base, [
      "action",
      "requestId",
      "enterpriseAccountId",
      "teamId",
      "targetUserId",
      "expectedVersion",
      "reason",
    ]);
    return {
      ...evidence,
      action: base.action,
      enterpriseAccountId,
      teamId: parseId(base.teamId, "Enterprise Team"),
      targetUserId: parseId(base.targetUserId, "使用者"),
      expectedVersion: parseVersion(
        base.expectedVersion,
        "Enterprise Team membership",
        base.action === "add-enterprise-team-member",
      ),
    };
  }
  if (
    base.action === "assign-enterprise-team-organization" ||
    base.action === "detach-enterprise-team-organization"
  ) {
    requireExactGovernanceKeys(base, [
      "action",
      "requestId",
      "enterpriseAccountId",
      "teamId",
      "organizationAccountId",
      "expectedVersion",
      "reason",
    ]);
    return {
      ...evidence,
      action: base.action,
      enterpriseAccountId,
      teamId: parseId(base.teamId, "Enterprise Team"),
      organizationAccountId: parseId(base.organizationAccountId, "Organization"),
      expectedVersion: parseVersion(
        base.expectedVersion,
        "Enterprise Team Organization assignment",
        base.action === "assign-enterprise-team-organization",
      ),
    };
  }
  throw new GovernanceAccessError(400, "invalid-input", "不支援此 Enterprise 操作。");
}

export function enterpriseGovernance(
  port: EnterpriseGovernancePort,
  clock: () => number = Date.now,
) {
  return {
    list(actor: VerifiedLineActor, query: GovernanceQuery = {}) {
      return port.list(actor, query);
    },
    detail(actor: VerifiedLineActor, enterpriseAccountId: string) {
      return port.detail(actor, parseId(enterpriseAccountId, "Enterprise"));
    },
    detailBySlug(actor: VerifiedLineActor, value: string) {
      return port.detailBySlug(actor, normalizeEnterpriseSlug(value));
    },
    execute(actor: VerifiedLineActor, raw: unknown) {
      return port.execute(actor, parseEnterpriseCommand(raw), clock());
    },
  };
}
