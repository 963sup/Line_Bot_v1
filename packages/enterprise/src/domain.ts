import type { AccountId, UserId } from "@line_bot_v1/account/domain";

export type EnterpriseAccountId = AccountId;

type EnterpriseStatus = "active" | "inactive";

export type Enterprise = Readonly<{
  id: EnterpriseAccountId;
  status: EnterpriseStatus;
  version: number;
}>;

export type EnterpriseTeam = Readonly<{
  id: string;
  enterpriseAccountId: EnterpriseAccountId;
  name: string;
  slug: string;
  version: number;
}>;

export type EnterpriseTeamMembership = Readonly<{
  teamId: string;
  enterpriseAccountId: EnterpriseAccountId;
  userId: UserId;
  status: "active" | "removed";
  version: number;
}>;

export type EnterpriseTeamOrganizationAssignment = Readonly<{
  teamId: string;
  enterpriseAccountId: EnterpriseAccountId;
  organizationAccountId: AccountId;
  status: "active" | "detached";
  version: number;
}>;

type EnterpriseFailureCode =
  | "invalid-input"
  | "conflict"
  | "invalid-transition"
  | "inactive"
  | "forbidden"
  | "not-found"
  | "scope-conflict"
  | "last-effective-role-holder";

export class EnterpriseError extends Error {
  constructor(
    public code: EnterpriseFailureCode,
    message: string,
  ) {
    super(message);
  }
}

export type EnterpriseOwnerAssignment = Readonly<{
  status: "active" | "revoked";
  version: number;
  userStatusVersion: number;
}>;

export function requireActiveEnterprise(status: "active" | "inactive") {
  if (status !== "active")
    throw new EnterpriseError("inactive", "停用的 Enterprise 不能變更 owner role。");
}

export function requireDirectEnterpriseOwnerAffiliation(active: boolean) {
  if (!active)
    throw new EnterpriseError(
      "forbidden",
      "EnterpriseOwner 對象必須有 active direct Enterprise affiliation。",
    );
}

export function grantEnterpriseOwner(
  current: EnterpriseOwnerAssignment | null,
  expectedVersion: number,
  userStatusVersion: number,
): EnterpriseOwnerAssignment {
  if ((current?.version ?? 0) !== expectedVersion)
    throw new EnterpriseError("conflict", "EnterpriseOwner 指派版本已更新。");
  if (current?.status === "active" && current.userStatusVersion === userStatusVersion)
    throw new EnterpriseError("invalid-transition", "EnterpriseOwner 已生效。");
  return { status: "active", version: (current?.version ?? 0) + 1, userStatusVersion };
}

export function revokeEnterpriseOwner(
  current: EnterpriseOwnerAssignment | null,
  expectedVersion: number,
): EnterpriseOwnerAssignment {
  if (!current) throw new EnterpriseError("not-found", "找不到 EnterpriseOwner 指派。");
  if (current.version !== expectedVersion)
    throw new EnterpriseError("conflict", "EnterpriseOwner 指派版本已更新。");
  if (current.status !== "active")
    throw new EnterpriseError("invalid-transition", "EnterpriseOwner 已撤銷。");
  return { ...current, status: "revoked", version: current.version + 1 };
}

export function requireReplacementEnterpriseOwner(
  targetEffective: boolean,
  anotherEffective: boolean,
) {
  if (targetEffective && !anotherEffective)
    throw new EnterpriseError(
      "last-effective-role-holder",
      "不能撤銷最後一位有效 EnterpriseOwner。",
    );
}

export type EnterpriseInvitationState = Readonly<{
  status: "pending" | "accepted" | "declined" | "cancelled";
  version: number;
}>;
export type EnterpriseDirectAffiliationState = Readonly<{
  status: "active" | "removed";
  version: number;
}>;

export function requireNoEffectiveEnterpriseAffiliation(effective: boolean) {
  if (effective) throw new EnterpriseError("invalid-transition", "使用者已是 Enterprise user。");
}

export function inviteEnterpriseUser(
  current: EnterpriseInvitationState | null,
  expectedVersion: number,
): EnterpriseInvitationState {
  if (!current) {
    if (expectedVersion !== 0) throw new EnterpriseError("conflict", "Invitation 版本不符。");
    return { status: "pending", version: 1 };
  }
  if (current.version !== expectedVersion || current.status === "pending")
    throw new EnterpriseError("conflict", "Invitation 狀態或版本不符。");
  return { status: "pending", version: current.version + 1 };
}

export function resolveEnterpriseInvitation(
  current: EnterpriseInvitationState | null,
  expectedVersion: number,
  status: "accepted" | "declined" | "cancelled",
): EnterpriseInvitationState {
  if (!current || current.status !== "pending" || current.version !== expectedVersion)
    throw new EnterpriseError("conflict", "找不到指定版本的 pending invitation。");
  return { status, version: current.version + 1 };
}

export function activateEnterpriseDirectAffiliation(
  current: EnterpriseDirectAffiliationState | null,
): EnterpriseDirectAffiliationState {
  return { status: "active", version: (current?.version ?? 0) + 1 };
}

export function removeEnterpriseDirectAffiliation(
  current: EnterpriseDirectAffiliationState | null,
  expectedVersion: number,
): EnterpriseDirectAffiliationState {
  if (!current || current.status !== "active" || current.version !== expectedVersion)
    throw new EnterpriseError("conflict", "找不到指定版本的有效 direct affiliation。");
  return { status: "removed", version: current.version + 1 };
}

export function requireNoDerivedEnterpriseAffiliation(hasOtherSource: boolean) {
  if (hasOtherSource)
    throw new EnterpriseError(
      "scope-conflict",
      "仍透過 Organization 隸屬此 Enterprise；請先解除對應 Organization participation。",
    );
}

export function normalizeEnterpriseSlug(value: string) {
  const slug = value.trim().toLowerCase();
  if (slug.length < 1 || slug.length > 39 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    throw new EnterpriseError("invalid-input", "Enterprise slug is invalid.");
  }
  return slug;
}

export function normalizeEnterpriseName(value: string) {
  const name = value.trim();
  if (!name || name.length > 120)
    throw new EnterpriseError("invalid-input", "Enterprise name is invalid.");
  return name;
}

export type EnterpriseIdentityState = Readonly<{
  name: string | null;
  slug: string | null;
  version: number;
}>;

export function completeEnterpriseIdentity(
  current: EnterpriseIdentityState,
  expectedVersion: number,
  name: string,
  slug: string,
) {
  if (current.version !== expectedVersion)
    throw new EnterpriseError("conflict", "Enterprise 版本已更新。");
  if (current.name !== null || current.slug !== null)
    throw new EnterpriseError(
      "invalid-transition",
      "Enterprise identity 已完成，不能再次以 recovery command 修改。",
    );
  return {
    name: normalizeEnterpriseName(name),
    slug: normalizeEnterpriseSlug(slug),
    version: current.version + 1,
  };
}

const enterpriseTeamSlugPattern = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;

export function normalizeEnterpriseTeamSlug(value: string): string {
  const slug = value.normalize("NFKC").trim().toLowerCase();
  if (slug.length < 1 || slug.length > 80 || !enterpriseTeamSlugPattern.test(slug)) {
    throw new EnterpriseError("invalid-input", "Enterprise team slug is invalid.");
  }
  return slug;
}

export function enterpriseTeamSlugFromName(value: string): string {
  const slug = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return normalizeEnterpriseTeamSlug(slug);
}

function requireId(value: string, field: string) {
  const id = value.trim();
  if (!/^[\w-]{1,128}$/.test(id)) {
    throw new EnterpriseError("invalid-input", `${field} is invalid.`);
  }
  return id;
}

function requireName(value: string) {
  const name = value.trim();
  if (name.length < 1 || name.length > 80) {
    throw new EnterpriseError("invalid-input", "Enterprise team name is invalid.");
  }
  return name;
}

function requireVersion(version: number) {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new EnterpriseError("invalid-input", "Enterprise version is invalid.");
  }
}

function requireExpectedVersion(actual: number, expected: number, field: string) {
  if (!Number.isSafeInteger(expected) || expected < 1) {
    throw new EnterpriseError("invalid-input", `${field} expected version is invalid.`);
  }
  if (actual !== expected) {
    throw new EnterpriseError("conflict", `${field} version conflict.`);
  }
}

function requireEnterpriseTeamIdentity(team: EnterpriseTeam) {
  requireId(team.id, "Enterprise team id");
  requireId(team.enterpriseAccountId, "Enterprise id");
  requireName(team.name);
  normalizeEnterpriseTeamSlug(team.slug);
  requireVersion(team.version);
}

export function createEnterprise(id: EnterpriseAccountId): Enterprise {
  return { id: requireId(id, "Enterprise id"), status: "active", version: 1 };
}

export function deactivateEnterprise(enterprise: Enterprise, expectedVersion: number): Enterprise {
  requireId(enterprise.id, "Enterprise id");
  requireVersion(enterprise.version);
  requireExpectedVersion(enterprise.version, expectedVersion, "Enterprise");
  if (enterprise.status !== "active") {
    throw new EnterpriseError("invalid-transition", "Enterprise is already inactive.");
  }
  return { ...enterprise, status: "inactive", version: enterprise.version + 1 };
}

export function reactivateEnterprise(enterprise: Enterprise, expectedVersion: number): Enterprise {
  requireId(enterprise.id, "Enterprise id");
  requireVersion(enterprise.version);
  requireExpectedVersion(enterprise.version, expectedVersion, "Enterprise");
  if (enterprise.status !== "inactive") {
    throw new EnterpriseError("invalid-transition", "Enterprise is already active.");
  }
  return { ...enterprise, status: "active", version: enterprise.version + 1 };
}

export function createEnterpriseTeam(
  enterpriseAccountId: EnterpriseAccountId,
  teamId: string,
  name: string,
): EnterpriseTeam {
  return {
    id: requireId(teamId, "Enterprise team id"),
    enterpriseAccountId: requireId(enterpriseAccountId, "Enterprise id"),
    name: requireName(name),
    slug: enterpriseTeamSlugFromName(name),
    version: 1,
  };
}

export function renameEnterpriseTeam(
  team: EnterpriseTeam,
  name: string,
  expectedVersion: number,
): EnterpriseTeam {
  requireEnterpriseTeamIdentity(team);
  requireExpectedVersion(team.version, expectedVersion, "Enterprise team");
  const nextName = requireName(name);
  if (team.name === nextName) {
    throw new EnterpriseError("invalid-transition", "Enterprise team name is unchanged.");
  }
  return {
    ...team,
    name: nextName,
    slug: enterpriseTeamSlugFromName(nextName),
    version: team.version + 1,
  };
}

export function createEnterpriseTeamMembership(
  team: EnterpriseTeam,
  userId: UserId,
): EnterpriseTeamMembership {
  requireEnterpriseTeamIdentity(team);
  return {
    teamId: team.id,
    enterpriseAccountId: team.enterpriseAccountId,
    userId: requireId(userId, "User id"),
    status: "active",
    version: 1,
  };
}

export function removeEnterpriseTeamMembership(
  membership: EnterpriseTeamMembership,
  expectedVersion: number,
): EnterpriseTeamMembership {
  requireId(membership.teamId, "Enterprise team id");
  requireId(membership.enterpriseAccountId, "Enterprise id");
  requireId(membership.userId, "User id");
  requireExpectedVersion(membership.version, expectedVersion, "Enterprise team membership");
  if (membership.status !== "active") {
    throw new EnterpriseError(
      "invalid-transition",
      "Enterprise team membership is already removed.",
    );
  }
  return { ...membership, status: "removed", version: membership.version + 1 };
}

export function assignEnterpriseTeamToOrganization(
  team: EnterpriseTeam,
  organizationAccountId: AccountId,
): EnterpriseTeamOrganizationAssignment {
  requireEnterpriseTeamIdentity(team);
  return {
    teamId: team.id,
    enterpriseAccountId: team.enterpriseAccountId,
    organizationAccountId: requireId(organizationAccountId, "Organization id"),
    status: "active",
    version: 1,
  };
}

export function detachEnterpriseTeamFromOrganization(
  assignment: EnterpriseTeamOrganizationAssignment,
  expectedVersion: number,
): EnterpriseTeamOrganizationAssignment {
  requireId(assignment.teamId, "Enterprise team id");
  requireId(assignment.enterpriseAccountId, "Enterprise id");
  requireId(assignment.organizationAccountId, "Organization id");
  requireExpectedVersion(
    assignment.version,
    expectedVersion,
    "Enterprise team organization assignment",
  );
  if (assignment.status !== "active") {
    throw new EnterpriseError(
      "invalid-transition",
      "Enterprise team assignment is already detached.",
    );
  }
  return { ...assignment, status: "detached", version: assignment.version + 1 };
}
