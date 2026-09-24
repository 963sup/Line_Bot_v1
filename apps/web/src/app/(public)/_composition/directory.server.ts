import { PostgresOrganizationPublicStore } from "@line-work/organization/adapters/postgres/public";
import { createPublicOrganizations } from "@line-work/organization/application/public";

const state = globalThis as typeof globalThis & {
  organizationPublicStore?: PostgresOrganizationPublicStore;
};

function organizationPublicStore() {
  return (state.organizationPublicStore ??= new PostgresOrganizationPublicStore());
}

export function publicOrganizations() {
  return createPublicOrganizations(organizationPublicStore());
}
