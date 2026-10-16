import { TeamError } from "../../contracts/errors/team-error.js";
import {
  normalizeTeamSlugValue,
  TeamDomainError,
  teamSlugFromNameValue,
} from "../../domain/team.js";

function presentSlug<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof TeamDomainError && error.code === "invalid-slug") {
      throw new TeamError(400, error.message);
    }
    throw error;
  }
}

export function normalizeTeamSlug(value: string): string {
  return presentSlug(() => normalizeTeamSlugValue(value));
}

export function teamSlugFromName(value: string): string {
  return presentSlug(() => teamSlugFromNameValue(value));
}
