import type { GovernanceReceipt } from "@line-work/identity-access/contracts/governance";

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

export type EnterpriseSummary = Readonly<{
  id: string;
  name: string;
  slug: string;
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
    teams: readonly EnterpriseTeamProjection[];
  }>;

export type EnterpriseCommand =
  | Readonly<{
      action: "create-enterprise";
      requestId: string;
      slug: string;
      name: string;
      reason: string;
    }>
  | Readonly<{
      action: "deactivate" | "reactivate";
      requestId: string;
      enterpriseAccountId: string;
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
