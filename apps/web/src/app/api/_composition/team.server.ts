import { PostgresTeamRepository } from "@line-work/team/adapters/postgres";
import { createTeamCollaboration } from "@line-work/team/application/collaboration";

export const teamCollaboration = createTeamCollaboration(
  () => new PostgresTeamRepository(),
  () => Date.now(),
);
