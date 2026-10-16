import type { GovernanceReceipt } from "@line_bot_v1/identity-access/contracts/governance";

export type EnterpriseMutationEvidence = Readonly<{
  requestId: string;
  payload: string;
  action: string;
  reason: string;
  at: number;
}>;

import {
  booleanValue,
  literalValue,
  nullableString,
  numberValue,
  record,
  stringValue,
} from "@line_bot_v1/platform/validation";
import { type RepositoryPermission, repositoryPermissions } from "@line_bot_v1/repository/domain";

export type EnterpriseAffiliationSource = Readonly<{
  kind: "direct" | "organization";
  id: string;
  version: number;
}>;

export type EnterpriseUserProjection = Readonly<{
  userId: string;
  sources: readonly EnterpriseAffiliationSource[];
  effectiveOwner: boolean;
  assignmentVersion: number | null;
}>;

export type EnterpriseDirectAffiliationProjection = Readonly<{
  userId: string;
  status: "active" | "removed";
  version: number;
}>;

export type EnterpriseInvitationProjection = Readonly<{
  userId: string;
  status: "pending" | "accepted" | "cancelled" | "declined";
  version: number;
}>;

export type EnterpriseTeamMembershipProjection = Readonly<{
  userId: string;
  status: "active" | "removed";
  version: number;
}>;

export type EnterpriseTeamOrganizationProjection = Readonly<{
  organizationAccountId: string;
  status: "active" | "detached";
  version: number;
}>;

export type EnterpriseTeamProjection = Readonly<{
  id: string;
  name: string;
  slug: string;
  version: number;
  members: readonly EnterpriseTeamMembershipProjection[];
  organizations: readonly EnterpriseTeamOrganizationProjection[];
}>;

type EnterpriseOutsideRepositoryCollaboratorProjection = Readonly<{
  organizationAccountId: string;
  repositoryId: string;
  userId: string;
  capability: RepositoryPermission;
  grantVersion: number;
}>;

type EnterpriseSummary = Readonly<{
  id: string;
  name: string | null;
  slug: string | null;
  status: "active" | "inactive";
  version: number;
  actorAffiliations: readonly EnterpriseAffiliationSource[];
  actorInvitationStatus: "pending" | "accepted" | "cancelled" | "declined" | null;
  actorInvitationVersion: number | null;
  actorIsOwner: boolean;
}>;

export type EnterpriseList = Readonly<{
  items: readonly EnterpriseSummary[];
  next: string | null;
}>;

export type EnterpriseDetail = EnterpriseSummary &
  Readonly<{
    users: readonly EnterpriseUserProjection[];
    directAffiliations: readonly EnterpriseDirectAffiliationProjection[];
    invitations: readonly EnterpriseInvitationProjection[];
    organizations: ReadonlyArray<{
      organizationAccountId: string;
      status: "active" | "detached";
      version: number;
    }>;
    outsideRepositoryCollaborators: readonly EnterpriseOutsideRepositoryCollaboratorProjection[];
    teams: readonly EnterpriseTeamProjection[];
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

function parseAffiliationSource(value: unknown): EnterpriseAffiliationSource {
  const source = record(value);
  return {
    kind: literalValue(source.kind, ["direct", "organization"]),
    id: stringValue(source.id),
    version: numberValue(source.version),
  };
}

function parseEnterpriseSummary(value: unknown): EnterpriseSummary {
  const summary = record(value);
  return {
    id: stringValue(summary.id),
    name: nullableString(summary.name),
    slug: nullableString(summary.slug),
    status: literalValue(summary.status, ["active", "inactive"]),
    version: numberValue(summary.version),
    actorAffiliations: arrayValue(summary.actorAffiliations, parseAffiliationSource),
    actorInvitationStatus: nullableLiteral(summary.actorInvitationStatus, [
      "pending",
      "accepted",
      "cancelled",
      "declined",
    ]),
    actorInvitationVersion: nullableNumber(summary.actorInvitationVersion),
    actorIsOwner: booleanValue(summary.actorIsOwner),
  };
}

function parseEnterpriseUser(value: unknown): EnterpriseUserProjection {
  const user = record(value);
  return {
    userId: stringValue(user.userId),
    sources: arrayValue(user.sources, parseAffiliationSource),
    effectiveOwner: booleanValue(user.effectiveOwner),
    assignmentVersion: nullableNumber(user.assignmentVersion),
  };
}

function parseDirectAffiliation(value: unknown): EnterpriseDirectAffiliationProjection {
  const affiliation = record(value);
  return {
    userId: stringValue(affiliation.userId),
    status: literalValue(affiliation.status, ["active", "removed"]),
    version: numberValue(affiliation.version),
  };
}

function parseInvitation(value: unknown): EnterpriseInvitationProjection {
  const invitation = record(value);
  return {
    userId: stringValue(invitation.userId),
    status: literalValue(invitation.status, ["pending", "accepted", "cancelled", "declined"]),
    version: numberValue(invitation.version),
  };
}

function parseTeamMembership(value: unknown): EnterpriseTeamMembershipProjection {
  const membership = record(value);
  return {
    userId: stringValue(membership.userId),
    status: literalValue(membership.status, ["active", "removed"]),
    version: numberValue(membership.version),
  };
}

function parseTeamOrganization(value: unknown): EnterpriseTeamOrganizationProjection {
  const organization = record(value);
  return {
    organizationAccountId: stringValue(organization.organizationAccountId),
    status: literalValue(organization.status, ["active", "detached"]),
    version: numberValue(organization.version),
  };
}

function parseTeam(value: unknown): EnterpriseTeamProjection {
  const team = record(value);
  return {
    id: stringValue(team.id),
    name: stringValue(team.name),
    slug: stringValue(team.slug),
    version: numberValue(team.version),
    members: arrayValue(team.members, parseTeamMembership),
    organizations: arrayValue(team.organizations, parseTeamOrganization),
  };
}

function parseOutsideRepositoryCollaborator(
  value: unknown,
): EnterpriseOutsideRepositoryCollaboratorProjection {
  const collaborator = record(value);
  return {
    organizationAccountId: stringValue(collaborator.organizationAccountId),
    repositoryId: stringValue(collaborator.repositoryId),
    userId: stringValue(collaborator.userId),
    capability: literalValue(collaborator.capability, repositoryPermissions),
    grantVersion: numberValue(collaborator.grantVersion),
  };
}

export function parseEnterpriseList(value: unknown): EnterpriseList {
  const list = record(value);
  return {
    items: arrayValue(list.items, parseEnterpriseSummary),
    next: nullableString(list.next),
  };
}

export function parseEnterpriseDetail(value: unknown): EnterpriseDetail {
  const detail = record(value);
  return {
    ...parseEnterpriseSummary(detail),
    users: arrayValue(detail.users, parseEnterpriseUser),
    directAffiliations: arrayValue(detail.directAffiliations, parseDirectAffiliation),
    invitations: arrayValue(detail.invitations, parseInvitation),
    organizations: arrayValue(detail.organizations, parseTeamOrganization),
    outsideRepositoryCollaborators: arrayValue(
      detail.outsideRepositoryCollaborators,
      parseOutsideRepositoryCollaborator,
    ),
    teams: arrayValue(detail.teams, parseTeam),
  };
}

export type EnterpriseCommand =
  | Readonly<{
      action: "create-enterprise";
      requestId: string;
      slug: string;
      name: string;
      reason: string;
    }>
  | Readonly<{
      action: "complete-enterprise-identity";
      requestId: string;
      enterpriseAccountId: string;
      slug: string;
      name: string;
      expectedVersion: number;
      reason: string;
    }>
  | Readonly<{
      action: "grant-enterprise-owner" | "revoke-enterprise-owner";
      requestId: string;
      enterpriseAccountId: string;
      targetUserId: string;
      expectedVersion: number;
      reason: string;
    }>
  | Readonly<{
      action: "leave-enterprise";
      requestId: string;
      enterpriseAccountId: string;
      expectedVersion: number;
      reason: string;
    }>
  | Readonly<{
      action:
        | "invite-user"
        | "accept-invitation"
        | "decline-invitation"
        | "cancel-invitation"
        | "remove-direct-affiliation";
      requestId: string;
      enterpriseAccountId: string;
      targetUserId: string;
      expectedVersion: number;
      reason: string;
    }>
  | Readonly<{
      action: "attach-organization" | "detach-organization";
      requestId: string;
      enterpriseAccountId: string;
      organizationAccountId: string;
      expectedEnterpriseVersion: number;
      expectedOrganizationVersion: number;
      expectedRelationVersion: number;
      reason: string;
    }>
  | Readonly<{
      action: "create-enterprise-team";
      requestId: string;
      enterpriseAccountId: string;
      name: string;
      reason: string;
    }>
  | Readonly<{
      action: "rename-enterprise-team";
      requestId: string;
      enterpriseAccountId: string;
      teamId: string;
      name: string;
      expectedVersion: number;
      reason: string;
    }>
  | Readonly<{
      action: "add-enterprise-team-member" | "remove-enterprise-team-member";
      requestId: string;
      enterpriseAccountId: string;
      teamId: string;
      targetUserId: string;
      expectedVersion: number;
      reason: string;
    }>
  | Readonly<{
      action: "assign-enterprise-team-organization" | "detach-enterprise-team-organization";
      requestId: string;
      enterpriseAccountId: string;
      teamId: string;
      organizationAccountId: string;
      expectedVersion: number;
      reason: string;
    }>;

export type EnterpriseReceipt = GovernanceReceipt;
