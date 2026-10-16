import type { OrganizationCommand } from "../../contracts/organization-governance.js";

export type OrganizationMembershipCommand = Extract<
  OrganizationCommand,
  {
    action:
      | "invite-member"
      | "accept-invitation"
      | "decline-invitation"
      | "cancel-invitation"
      | "remove-direct-membership"
      | "leave-organization";
  }
>;
