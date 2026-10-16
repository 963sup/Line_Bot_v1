import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresTeamMutationTransactions } from "../../adapters/outbound/persistence/team-mutation.js";
import { PostgresTeamQuery } from "../../adapters/outbound/persistence/team-query.js";
import { TeamCommandUseCase } from "../../application/use-cases/team-command.js";
import type { TeamActor, TeamRepository } from "../../contracts/input/team-collaboration.js";
import type { TeamCommand } from "../../contracts/input/team-command.js";
import type { TeamCommandReceipt, TeamView } from "../../contracts.js";

export class PostgresTeamRepository implements TeamRepository {
  private readonly query: PostgresTeamQuery;
  private readonly command: TeamCommandUseCase;

  constructor(db: Database = businessDatabase()) {
    this.query = new PostgresTeamQuery(db);
    this.command = new TeamCommandUseCase(new PostgresTeamMutationTransactions(db));
  }

  view(actor: TeamActor, organizationAccountId: string, teamId: string): Promise<TeamView> {
    return this.query.view(actor, organizationAccountId, teamId);
  }

  viewByLocator(actor: TeamActor, organizationLogin: string, teamSlug: string): Promise<TeamView> {
    return this.query.viewByLocator(actor, organizationLogin, teamSlug);
  }

  execute(actor: TeamActor, command: TeamCommand, now: number): Promise<TeamCommandReceipt> {
    return this.command.execute(actor, command, now);
  }
}
