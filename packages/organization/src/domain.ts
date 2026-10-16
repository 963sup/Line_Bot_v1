import type { AccountId, UserId } from "@line_bot_v1/account/domain";

export type OrganizationMemberRole = "ADMIN" | "MEMBER";

export type OrganizationAccountId = AccountId;

type OrganizationStatus = "active" | "inactive";

export type Organization = Readonly<{
  id: OrganizationAccountId;
  status: OrganizationStatus;
  version: number;
}>;

type OrganizationMembershipStatus = "active" | "removed";

type OrganizationMembership = Readonly<{
  organizationAccountId: OrganizationAccountId;
  userId: UserId;
  status: OrganizationMembershipStatus;
  version: number;
}>;

export type OrganizationDirectMembership = OrganizationMembership;

type OrganizationInvitationStatus = "pending" | "accepted" | "cancelled" | "declined";

export type OrganizationInvitation = Readonly<{
  organizationAccountId: OrganizationAccountId;
  userId: UserId;
  status: OrganizationInvitationStatus;
  version: number;
}>;

type OrganizationFailureCode =
  | "invalid-input"
  | "conflict"
  | "invalid-transition"
  | "inactive"
  | "forbidden"
  | "not-found"
  | "scope-conflict"
  | "last-effective-role-holder";

export class OrganizationError extends Error {
  constructor(
    public code: OrganizationFailureCode,
    message: string,
  ) {
    super(message);
  }
}

export type OrganizationOwnerAssignment = Readonly<{
  status: "active" | "revoked";
  version: number;
  userStatusVersion: number;
  membershipVersion: number;
}>;

export function requireActiveOrganizationForOwner(status: "active" | "inactive") {
  if (status !== "active")
    throw new OrganizationError("inactive", "停用的 Organization 不能變更 owner role。");
}

export function requireOrganizationOwnerMembership(
  membership: { status: "active" | "removed"; version: number } | null,
): asserts membership is { status: "active"; version: number } {
  if (membership?.status !== "active")
    throw new OrganizationError(
      "forbidden",
      "OrganizationOwner 對象必須是有效 Organization member。",
    );
}

export function grantOrganizationOwner(
  current: OrganizationOwnerAssignment | null,
  expectedVersion: number,
  userStatusVersion: number,
  membershipVersion: number,
): OrganizationOwnerAssignment {
  const effective =
    current?.status === "active" &&
    current.userStatusVersion === userStatusVersion &&
    current.membershipVersion === membershipVersion;
  if (expectedVersion !== (effective ? current.version : 0))
    throw new OrganizationError("conflict", "OrganizationOwner 指派版本已更新。");
  if (effective) throw new OrganizationError("invalid-transition", "OrganizationOwner 已生效。");
  return {
    status: "active",
    version: (current?.version ?? 0) + 1,
    userStatusVersion,
    membershipVersion,
  };
}

export function revokeOrganizationOwner(
  current: OrganizationOwnerAssignment | null,
  expectedVersion: number,
  userStatusVersion: number | null,
  membershipVersion: number,
): OrganizationOwnerAssignment {
  if (!current) throw new OrganizationError("not-found", "找不到 OrganizationOwner 指派。");
  if (
    userStatusVersion === null ||
    current.status !== "active" ||
    current.userStatusVersion !== userStatusVersion ||
    current.membershipVersion !== membershipVersion
  )
    throw new OrganizationError("invalid-transition", "OrganizationOwner 指派已失效。");
  if (current.version !== expectedVersion)
    throw new OrganizationError("conflict", "OrganizationOwner 指派版本已更新。");
  return { ...current, status: "revoked", version: current.version + 1 };
}

export function requireReplacementOrganizationOwner(
  targetEffective: boolean,
  anotherEffective: boolean,
) {
  if (targetEffective && !anotherEffective)
    throw new OrganizationError(
      "last-effective-role-holder",
      "不能撤銷最後一位有效 OrganizationOwner。",
    );
}

export function requireOrganizationOwnerAfterSourceRemoval(
  hasOtherSource: boolean,
  targetEffective: boolean,
  anotherEffective: boolean,
) {
  if (!hasOtherSource && targetEffective && !anotherEffective)
    throw new OrganizationError(
      "last-effective-role-holder",
      "不能移除最後一位有效 OrganizationOwner 的最後 membership source。",
    );
}

function requireId(value: string, field: string) {
  const id = value.trim();
  if (!/^[\w-]{1,128}$/.test(id)) {
    throw new OrganizationError("invalid-input", `${field} is invalid.`);
  }
  return id;
}

function requireVersion(version: number, field: string) {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new OrganizationError("invalid-input", `${field} version is invalid.`);
  }
}

function requireExpectedVersion(actual: number, expected: number, field: string) {
  requireVersion(actual, field);
  requireVersion(expected, `Expected ${field}`);
  if (actual !== expected) {
    throw new OrganizationError("conflict", `${field} version conflict.`);
  }
}

export function createOrganization(id: OrganizationAccountId): Organization {
  return { id: requireId(id, "Organization id"), status: "active", version: 1 };
}

export function deactivateOrganization(
  organization: Organization,
  expectedVersion: number,
): Organization {
  requireId(organization.id, "Organization id");
  requireExpectedVersion(organization.version, expectedVersion, "Organization");
  if (organization.status !== "active") {
    throw new OrganizationError("invalid-transition", "Organization is already inactive.");
  }
  return { ...organization, status: "inactive", version: organization.version + 1 };
}

export function reactivateOrganization(
  organization: Organization,
  expectedVersion: number,
): Organization {
  requireId(organization.id, "Organization id");
  requireExpectedVersion(organization.version, expectedVersion, "Organization");
  if (organization.status !== "inactive") {
    throw new OrganizationError("invalid-transition", "Organization is already active.");
  }
  return { ...organization, status: "active", version: organization.version + 1 };
}

export function createOrganizationInvitation(
  organizationAccountId: OrganizationAccountId,
  userId: UserId,
): OrganizationInvitation {
  return {
    organizationAccountId: requireId(organizationAccountId, "Organization account id"),
    userId: requireId(userId, "User id"),
    status: "pending",
    version: 1,
  };
}

export function requireActiveOrganizationMembershipScope(status: "active" | "inactive") {
  if (status !== "active")
    throw new OrganizationError("inactive", "停用的 Organization 不能變更人員關係。");
}

export function requireNoActiveOrganizationMembership(active: boolean) {
  if (active) throw new OrganizationError("invalid-transition", "使用者已是 Organization member。");
}

export function requireNoDerivedOrganizationMembership(hasOtherSource: boolean) {
  if (hasOtherSource)
    throw new OrganizationError(
      "scope-conflict",
      "仍透過 Enterprise Team 取得此 Organization membership；請先解除該來源。",
    );
}

export function inviteOrganizationUser(
  current: OrganizationInvitation | null,
  organizationAccountId: OrganizationAccountId,
  userId: UserId,
  expectedVersion: number,
): OrganizationInvitation {
  if (!current) {
    if (expectedVersion !== 0) throw new OrganizationError("conflict", "Invitation 版本不符。");
    return createOrganizationInvitation(organizationAccountId, userId);
  }
  if (current.version !== expectedVersion || current.status === "pending")
    throw new OrganizationError("conflict", "Invitation 狀態或版本不符。");
  return { ...current, status: "pending", version: current.version + 1 };
}

export function resolveOrganizationInvitation(
  invitation: OrganizationInvitation,
  status: "accepted" | "cancelled" | "declined",
  expectedVersion: number,
): OrganizationInvitation {
  requireId(invitation.organizationAccountId, "Organization account id");
  requireId(invitation.userId, "User id");
  requireExpectedVersion(invitation.version, expectedVersion, "Organization invitation");
  if (invitation.status !== "pending") {
    throw new OrganizationError(
      "invalid-transition",
      "Only pending organization invitation can be resolved.",
    );
  }
  return { ...invitation, status, version: invitation.version + 1 };
}

export function createOrganizationDirectMembership(
  organizationAccountId: OrganizationAccountId,
  userId: UserId,
): OrganizationDirectMembership {
  return {
    organizationAccountId: requireId(organizationAccountId, "Organization account id"),
    userId: requireId(userId, "User id"),
    status: "active",
    version: 1,
  };
}

export function activateOrganizationDirectMembership(
  organizationAccountId: OrganizationAccountId,
  userId: UserId,
  current: OrganizationDirectMembership | null,
): OrganizationDirectMembership {
  return {
    ...createOrganizationDirectMembership(organizationAccountId, userId),
    version: (current?.version ?? 0) + 1,
  };
}

export function removeOrganizationDirectMembership(
  membership: OrganizationDirectMembership,
  expectedVersion: number,
): OrganizationDirectMembership {
  requireId(membership.organizationAccountId, "Organization account id");
  requireId(membership.userId, "User id");
  requireExpectedVersion(membership.version, expectedVersion, "Organization direct membership");
  if (membership.status === "removed") {
    throw new OrganizationError(
      "invalid-transition",
      "Organization direct membership is already removed.",
    );
  }
  return { ...membership, status: "removed", version: membership.version + 1 };
}
