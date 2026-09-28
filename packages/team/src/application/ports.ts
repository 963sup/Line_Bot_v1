import type { TeamCommandReceipt, TeamView } from "../contracts.js";
import type { TeamCommand } from "../domain.js";

export type TeamActor = { provider: string; subject: string };

export interface TeamRepository {
  view(actor: TeamActor, organizationAccountId: string, teamId: string): Promise<TeamView>;
  viewByLocator(actor: TeamActor, organizationLogin: string, teamSlug: string): Promise<TeamView>;
  execute(actor: TeamActor, command: TeamCommand, now: number): Promise<TeamCommandReceipt>;
}
