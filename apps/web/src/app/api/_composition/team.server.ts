import { PostgresTeamRepository } from "@line_bot_v1/team/adapters/postgres";
import { createTeamCollaboration } from "@line_bot_v1/team/application/collaboration";

export const teamCollaboration = createTeamCollaboration(
  () => new PostgresTeamRepository(),
  () => Date.now(),
);
