import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import type { EnterpriseCommand } from "../../contracts/enterprise-governance.js";
import {
  normalizeEnterpriseName,
  normalizeEnterpriseSlug,
  normalizeEnterpriseTeamName,
} from "../../domain.js";
import type { EnterpriseLifecycleCommand } from "./enterprise-lifecycle.js";

export type EnterpriseOwnerCommand = Extract<
  EnterpriseCommand,
  { action: "grant-enterprise-owner" | "revoke-enterprise-owner" }
>;

export type EnterpriseAffiliationCommand = Extract<
  EnterpriseCommand,
  {
    action:
      | "invite-user"
      | "accept-invitation"
      | "decline-invitation"
      | "cancel-invitation"
      | "remove-direct-affiliation"
      | "leave-enterprise";
  }
>;

export type EnterpriseIdentityCommand = Extract<
  EnterpriseCommand,
  { action: "create-enterprise" | "complete-enterprise-identity" }
>;

export type EnterpriseOrganizationCommand = Extract<
  EnterpriseCommand,
  { action: "attach-organization" | "detach-organization" }
>;

export type EnterpriseTeamCommand = Extract<
  EnterpriseCommand,
  { action: "create-enterprise-team" } | { teamId: string }
>;

const governanceUuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const governanceId = /^[\w-]{1,128}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function governanceInput(raw: unknown, allowed: string[]) {
  if (!isRecord(raw)) {
    throw new GovernanceAccessError(400, "invalid-input", "治理操作格式不正確。");
  }
  const value = raw;
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

export function parseId(value: unknown, name: string) {
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

function parseTeamName(value: unknown) {
  if (typeof value !== "string" || value !== value.trim()) {
    throw new GovernanceAccessError(400, "invalid-input", "Enterprise Team 名稱格式不正確。");
  }
  try {
    return normalizeEnterpriseTeamName(value);
  } catch {
    throw new GovernanceAccessError(400, "invalid-input", "Enterprise Team 名稱格式不正確。");
  }
}

function parseEnterpriseName(value: string) {
  try {
    return normalizeEnterpriseName(value);
  } catch {
    throw new GovernanceAccessError(400, "invalid-input", "Enterprise slug 或 name 不正確。");
  }
}

export function parseEnterpriseCommand(
  raw: unknown,
): EnterpriseCommand | EnterpriseLifecycleCommand {
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
    if (typeof base.slug !== "string" || typeof base.name !== "string") {
      throw new GovernanceAccessError(400, "invalid-input", "Enterprise slug 或 name 不正確。");
    }
    const name = parseEnterpriseName(base.name);
    try {
      return {
        ...evidence,
        action: base.action,
        slug: normalizeEnterpriseSlug(base.slug),
        name,
      };
    } catch {
      throw new GovernanceAccessError(400, "invalid-input", "Enterprise slug 不正確。");
    }
  }
  const enterpriseAccountId = parseId(base.enterpriseAccountId, "Enterprise");
  if (base.action === "complete-enterprise-identity") {
    requireExactGovernanceKeys(base, [
      "action",
      "requestId",
      "enterpriseAccountId",
      "slug",
      "name",
      "expectedVersion",
      "reason",
    ]);
    if (typeof base.slug !== "string" || typeof base.name !== "string") {
      throw new GovernanceAccessError(400, "invalid-input", "Enterprise slug 或 name 不正確。");
    }
    const name = parseEnterpriseName(base.name);
    try {
      return {
        ...evidence,
        action: base.action,
        enterpriseAccountId,
        slug: normalizeEnterpriseSlug(base.slug),
        name,
        expectedVersion: parseVersion(base.expectedVersion, "Enterprise"),
      };
    } catch {
      throw new GovernanceAccessError(400, "invalid-input", "Enterprise slug 不正確。");
    }
  }
  if (base.action === "grant-enterprise-owner" || base.action === "revoke-enterprise-owner") {
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
        "EnterpriseOwner",
        base.action === "grant-enterprise-owner",
      ),
    };
  }
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
