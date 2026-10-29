import { createTeamCollaboration } from "@line_bot_v1/team/application/collaboration";
import { PostgresTeamRepository } from "@line_bot_v1/team/postgres";

export const teamCollaboration = createTeamCollaboration(
  () => new PostgresTeamRepository(),
  () => Date.now(),
);
