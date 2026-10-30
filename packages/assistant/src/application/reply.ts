import { parseAssistantCommand } from "./parse-command.js";

export type AssistantEvent = { scope: string; userId: string; imageId?: string; text?: string };

export function createAssistantReply<ReceiptResult, Message>(deps: {
  receiptIntake: (
    userId: string,
    scope: string,
    command: { type: "receive"; imageId: string } | { type: "start" | "cancel" },
  ) => Promise<ReceiptResult>;
  activeUser: (subject: string) => Promise<unknown>;
  answer: (input: string) => Promise<string>;
  miniAppUrl: () => string;
  receiptMessage: (result: ReceiptResult, url: string) => Message | null;
  attendanceMessage: (url: string, command?: "clockIn" | "clockOut") => Message;
  diaryMessage: () => Message;
  textMessage: (text: string) => Message;
  reply: (token: string, message: Message) => Promise<unknown>;
}) {
  return async (token: string, event: AssistantEvent) => {
    const input = event.text ?? "";
    const command = parseAssistantCommand(input);
    let message: Message | null;
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
      message = deps.receiptMessage(result, deps.miniAppUrl());
    } else {
      await deps.activeUser(event.userId);
      message =
        command === "attendance" || command === "clockIn" || command === "clockOut"
          ? deps.attendanceMessage(
              deps.miniAppUrl(),
              command === "attendance" ? undefined : command,
            )
          : command === "diary"
            ? deps.diaryMessage()
            : deps.textMessage(await deps.answer(input));
    }
    if (!message) return false;
    return deps.reply(token, message);
  };
}
