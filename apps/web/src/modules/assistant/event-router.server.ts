import type { createReceiptIntake } from "@line-work/expense/application/receipt-intake";
import type { messagingApi } from "@line-work/line-channel/adapters/messaging";
import { parseAssistantCommand } from "./command-parser.server";
import {
  attendanceMessage,
  diaryMessage,
  receiptMessage,
  textMessage,
} from "./response-presenter.server";

export type AssistantEvent = { scope: string; userId: string; imageId?: string; text?: string };

export function createAssistantReply(deps: {
  receiptIntake: ReturnType<typeof createReceiptIntake>;
  activeUser: (subject: string) => Promise<unknown>;
  answer: (input: string) => Promise<string>;
  miniAppUrl: () => string;
  reply: (token: string, message: messagingApi.Message) => Promise<unknown>;
}) {
  return async (token: string, event: AssistantEvent) => {
    const input = event.text ?? "";
    const command = parseAssistantCommand(input);
    let message;
    if (event.imageId || command === "receipt" || command === "cancel") {
      const result = await deps.receiptIntake(
        event.userId,
        event.scope,
        event.imageId
          ? { type: "receive", imageId: event.imageId }
          : command === "cancel"
            ? { type: "cancel" }
            : { type: "start" },
      );
      message = receiptMessage(result, deps.miniAppUrl());
    } else {
      await deps.activeUser(event.userId);
      message =
        command === "attendance" || command === "clockIn" || command === "clockOut"
          ? attendanceMessage(deps.miniAppUrl(), command === "attendance" ? undefined : command)
          : command === "diary"
            ? diaryMessage()
            : textMessage(await deps.answer(input));
    }
    if (!message) return false;
    return deps.reply(token, message);
  };
}
