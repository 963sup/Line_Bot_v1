import type { PartnersView, PartnerView } from "../../contracts.js";

export type PartnerCursor = { name: string; id: string };

export interface PartnerRepository {
  view(userId: string, view?: PartnerView, cursor?: PartnerCursor): Promise<PartnersView>;
}
