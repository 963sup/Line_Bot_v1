import type { GovernanceReceipt } from "@line_bot_v1/identity-access/contracts/governance";
import {
  booleanValue,
  literalValue,
  nullableString,
  numberValue,
  record,
  stringValue,
} from "@line_bot_v1/platform/validation";

import type { OrganizationMemberRole } from "../domain.js";

export type OrganizationMembershipSource = Readonly<{
  kind: "direct" | "enterprise-team";
  id: string;
  version: number;
}>;

type OrganizationMemberCreationPolicy = Readonly<{
  memberCanCreatePublicRepositories: boolean;
  memberCanCreatePrivateRepositories: boolean;
  memberCanCreateInternalRepositories: boolean;
  memberCanCreateProjectV2: boolean;
  memberCanCreateTeams: boolean;
}>;

export type OrganizationMembershipProjection = Readonly<{
  userId: string;
  status: "active" | "removed";
  version: number;
  sources: readonly OrganizationMembershipSource[];
  directMembershipVersion: number | null;
  effectiveOwner: boolean;
  assignmentVersion: number | null;
  memberRole: OrganizationMemberRole;
}>;

export type OrganizationInvitationProjection = Readonly<{
  userId: string;
  status: "pending" | "accepted" | "cancelled" | "declined";
  version: number;
}>;

type OrganizationSummary = Readonly<{
  id: string;
  login: string;
  name: string;
  status: "active" | "inactive";
  version: number;
  actorMembershipStatus: "active" | "removed" | null;
  actorDirectMembershipVersion: number | null;
  actorInvitationStatus: "pending" | "accepted" | "cancelled" | "declined" | null;
  actorInvitationVersion: number | null;
  actorIsOwner: boolean;
  actorMemberRole: OrganizationMemberRole | null;
  actorCanCreateProjectV2: boolean;
}>;

export type OrganizationList = Readonly<{
  items: readonly OrganizationSummary[];
  next: string | null;
}>;

export type OrganizationDetail = OrganizationSummary &
  Readonly<{
    memberCreationPolicy: OrganizationMemberCreationPolicy;
    members: readonly OrganizationMembershipProjection[];
    invitations: readonly OrganizationInvitationProjection[];
  }>;

function arrayValue<T>(value: unknown, decode: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new TypeError("Expected an array");
  return value.map((item: unknown) => decode(item));
}

function nullableNumber(value: unknown): number | null {
  return value === null ? null : numberValue(value);
}

function nullableLiteral<const T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return value === null ? null : literalValue(value, allowed);
}

function parseMembershipSource(value: unknown): OrganizationMembershipSource {
  const source = record(value);
  return {
    kind: literalValue(source.kind, ["direct", "enterprise-team"]),
    id: stringValue(source.id),
    version: numberValue(source.version),
  };
}

function parseOrganizationSummary(value: unknown): OrganizationSummary {
  const summary = record(value);
  return {
    id: stringValue(summary.id),
    login: stringValue(summary.login),
    name: stringValue(summary.name),
    status: literalValue(summary.status, ["active", "inactive"]),
    version: numberValue(summary.version),
    actorMembershipStatus: nullableLiteral(summary.actorMembershipStatus, ["active", "removed"]),
    actorDirectMembershipVersion: nullableNumber(summary.actorDirectMembershipVersion),
    actorInvitationStatus: nullableLiteral(summary.actorInvitationStatus, [
      "pending",
      "accepted",
      "cancelled",
      "declined",
    ]),
    actorInvitationVersion: nullableNumber(summary.actorInvitationVersion),
    actorIsOwner: booleanValue(summary.actorIsOwner),
    actorMemberRole: nullableLiteral(summary.actorMemberRole, ["ADMIN", "MEMBER"]),
    actorCanCreateProjectV2: booleanValue(summary.actorCanCreateProjectV2),
  };
}

function parseMemberCreationPolicy(value: unknown): OrganizationMemberCreationPolicy {
  const policy = record(value);
  return {
    memberCanCreatePublicRepositories: booleanValue(policy.memberCanCreatePublicRepositories),
    memberCanCreatePrivateRepositories: booleanValue(policy.memberCanCreatePrivateRepositories),
    memberCanCreateInternalRepositories: booleanValue(policy.memberCanCreateInternalRepositories),
    memberCanCreateProjectV2: booleanValue(policy.memberCanCreateProjectV2),
    memberCanCreateTeams: booleanValue(policy.memberCanCreateTeams),
  };
}

function parseMembership(value: unknown): OrganizationMembershipProjection {
  const membership = record(value);
  return {
    userId: stringValue(membership.userId),
    status: literalValue(membership.status, ["active", "removed"]),
    version: numberValue(membership.version),
    sources: arrayValue(membership.sources, parseMembershipSource),
    directMembershipVersion: nullableNumber(membership.directMembershipVersion),
    effectiveOwner: booleanValue(membership.effectiveOwner),
    assignmentVersion: nullableNumber(membership.assignmentVersion),
    memberRole: literalValue(membership.memberRole, ["ADMIN", "MEMBER"]),
  };
}

function parseInvitation(value: unknown): OrganizationInvitationProjection {
  const invitation = record(value);
  return {
    userId: stringValue(invitation.userId),
    status: literalValue(invitation.status, ["pending", "accepted", "cancelled", "declined"]),
    version: numberValue(invitation.version),
  };
}

export function parseOrganizationList(value: unknown): OrganizationList {
  const list = record(value);
  return {
    items: arrayValue(list.items, parseOrganizationSummary),
    next: nullableString(list.next),
  };
}

export function parseOrganizationDetail(value: unknown): OrganizationDetail {
  const detail = record(value);
  return {
    ...parseOrganizationSummary(detail),
    memberCreationPolicy: parseMemberCreationPolicy(detail.memberCreationPolicy),
    members: arrayValue(detail.members, parseMembership),
    invitations: arrayValue(detail.invitations, parseInvitation),
  };
}

export type OrganizationCommand =
  | Readonly<
      {
        action: "update-member-creation-policy";
        requestId: string;
        organizationAccountId: string;
        expectedVersion: number;
        reason: string;
      } & OrganizationMemberCreationPolicy
    >
  | Readonly<{
      action: "create-organization";
      requestId: string;
      login: string;
      name: string;
      reason: string;
    }>
  | Readonly<{
      action: "grant-organization-owner" | "revoke-organization-owner";
      requestId: string;
      organizationAccountId: string;
      targetUserId: string;
      expectedVersion: number;
      reason: string;
    }>
  | Readonly<{
      action: "deactivate" | "reactivate";
      requestId: string;
      organizationAccountId: string;
      expectedVersion: number;
      reason: string;
    }>
  | Readonly<{
      action: "leave-organization";
      requestId: string;
      organizationAccountId: string;
      expectedVersion: number;
      reason: string;
    }>
  | Readonly<{
      action:
        | "invite-member"
        | "accept-invitation"
        | "decline-invitation"
        | "cancel-invitation"
        | "remove-direct-membership";
      requestId: string;
      organizationAccountId: string;
      targetUserId: string;
      expectedVersion: number;
      reason: string;
    }>;

export type OrganizationReceipt = GovernanceReceipt;
