import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";

export type LegacyWbsEntry = Readonly<{
  entryRequired: boolean;
}>;

/** Read-only projection for deciding whether Repository Overview exposes legacy WBS recovery. */
export interface LegacyWbsEntryQuery {
  read(userId: string, selector: RepositorySelector): Promise<LegacyWbsEntry>;
}
