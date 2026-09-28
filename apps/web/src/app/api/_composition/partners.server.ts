import { hasPermission } from "@line_bot_v1/identity-access/postgres";
import { createPartners } from "@line_bot_v1/partners/application/partners";
import { PostgresPartnerRepository } from "@line_bot_v1/partners/postgres";
import { activeLineUser } from "./account.server";

export const partners = createPartners({
  activeUser: activeLineUser,
  repository: () => new PostgresPartnerRepository(hasPermission),
  now: () => Date.now(),
});
