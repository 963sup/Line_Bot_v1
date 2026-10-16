import type { OrganizationCommand } from "../../contracts/organization-governance.js";

export type OrganizationScopeCommand = Extract<
  OrganizationCommand,
  { action: "create-organization" | "update-member-creation-policy" }
>;
