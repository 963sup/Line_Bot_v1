import type { PartnersView, PartnerView } from "../../contracts.js";
import type { PartnerCommand } from "../../domain.js";

export type PartnerCursor = { name: string; id: string };

export interface PartnerRepository {
  view(userId: string, view?: PartnerView, cursor?: PartnerCursor): Promise<PartnersView>;
  execute(userId: string, command: PartnerCommand, now: number): Promise<{ id: string }>;
}
