import type { AccountId, UserId } from "@line-work/account/domain";

export type OrganizationAccountId = AccountId;

type OrganizationStatus = "active" | "inactive";

export type Organization = Readonly<{
  id: OrganizationAccountId;
  status: OrganizationStatus;
  version: number;
}>;

export type OrganizationMembershipStatus = "active" | "removed";

export type OrganizationMembership = Readonly<{
  organizationAccountId: OrganizationAccountId;
  userId: UserId;
  status: OrganizationMembershipStatus;
  version: number;
}>;

export type OrganizationDirectMembership = OrganizationMembership;

export type OrganizationInvitationStatus = "pending" | "accepted" | "cancelled" | "declined";

export type OrganizationInvitation = Readonly<{
  organizationAccountId: OrganizationAccountId;
  userId: UserId;
  status: OrganizationInvitationStatus;
  version: number;
}>;

type OrganizationFailureCode = "invalid-input" | "conflict" | "invalid-transition";

export class OrganizationError extends Error {
  constructor(
    public code: OrganizationFailureCode,
    message: string,
  ) {
    super(message);
  }
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
