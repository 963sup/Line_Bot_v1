import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import type { LegacyWbsEntryQuery } from "../../contracts/output/legacy-entry.js";

export function createLegacyWbsEntry(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  query(): LegacyWbsEntryQuery;
}) {
  return {
    async read(subject: string, selector: RepositorySelector) {
      const actor = await deps.activeUser(subject);
      return deps.query().read(actor.id, selector);
    },
  };
}
