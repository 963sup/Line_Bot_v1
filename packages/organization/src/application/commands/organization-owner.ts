import type { OrganizationCommand } from "../../contracts/organization-governance.js";

export type OrganizationOwnerCommand = Extract<
  OrganizationCommand,
  { action: "grant-organization-owner" | "revoke-organization-owner" }
>;
