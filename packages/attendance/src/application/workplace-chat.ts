import { transitionWorkplaceChat, type WorkplaceChatInput } from "../domain.js";
import type { WorkplaceChatStore } from "./ports/workplace-chat.js";

export function createWorkplaceChat(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): WorkplaceChatStore;
  now(): number;
  uuid(): string;
}) {
  return async (subject: string, eventId: string, eventAt: number, input: WorkplaceChatInput) => {
    const member = await deps.activeUser(subject);
    const now = deps.now();
    return deps
      .store()
      .transact(
        member.id,
        eventId,
        (draft) => transitionWorkplaceChat(draft, input, now, eventAt, deps.uuid()),
        now,
      );
  };
}
