import type { TeamRepository } from "../input/team-collaboration.js";

export type TeamQuery = Pick<TeamRepository, "view" | "viewByLocator">;
