import { hasPermission } from "@line-work/identity-access/adapters/postgres";
import { PostgresPartnerRepository } from "@line-work/partners/adapters/postgres";
import { createPartners } from "@line-work/partners/application/partners";
import { activeLineUser } from "./account.server";

export const partners = createPartners({
  activeUser: activeLineUser,
  repository: () => new PostgresPartnerRepository(hasPermission),
  now: () => Date.now(),
});
