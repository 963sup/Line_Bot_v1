import { createPublicOrganizations } from "@line_bot_v1/organization/application/public";
import { PostgresOrganizationPublicStore } from "@line_bot_v1/organization/postgres/public";

function organizationPublicStore() {
  return (globalThis.organizationPublicStore ??= new PostgresOrganizationPublicStore());
}

export function publicOrganizations() {
  return createPublicOrganizations(organizationPublicStore());
}
