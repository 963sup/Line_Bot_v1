import type { GovernanceReceipt } from "@line-work/identity-access/contracts/governance";

export type OrganizationMembershipSource = Readonly<{
  kind: "direct" | "enterprise-team";
  id: string;
  version: number;
}>;

export type OrganizationMembershipProjection = Readonly<{
  userId: string;
  status: "active" | "removed";
  version: number;
  sources: readonly OrganizationMembershipSource[];
  directMembershipVersion: number | null;
  effectiveOwner: boolean;
  assignmentVersion: number | null;
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
}>;

export type OrganizationList = Readonly<{
  items: readonly OrganizationSummary[];
  next: string | null;
}>;

export type OrganizationDetail = OrganizationSummary &
  Readonly<{
    members: readonly OrganizationMembershipProjection[];
    invitations: readonly OrganizationInvitationProjection[];
  }>;

export type OrganizationCommand =
  | Readonly<{
      action: "create-organization";
      requestId: string;
      login: string;
      name: string;
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
