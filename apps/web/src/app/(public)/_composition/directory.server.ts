import { createPublicOrganizations } from "@line_bot_v1/organization/application/public";
import { PostgresOrganizationPublicStore } from "@line_bot_v1/organization/postgres/public";

const state = globalThis as typeof globalThis & {
  organizationPublicStore?: PostgresOrganizationPublicStore;
};

function organizationPublicStore() {
  return (state.organizationPublicStore ??= new PostgresOrganizationPublicStore());
}

export function publicOrganizations() {
  return createPublicOrganizations(organizationPublicStore());
}
