import type { WorkplaceChatDraft, WorkplaceChatResult, WorkplaceCommand } from "../../domain.js";

export interface WorkplaceChatStore {
  transact(
    actor: string,
    eventId: string,
    work: (
      draft: WorkplaceChatDraft | null,
    ) => WorkplaceChatResult & { command?: WorkplaceCommand },
    now: number,
  ): Promise<WorkplaceChatResult>;
}
