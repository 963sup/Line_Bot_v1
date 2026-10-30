import type { SelectedWebhookEvent } from "@line_bot_v1/assistant/application/webhook-router";
import {
  type LineWebhookEvent,
  parseLineMessage,
  parseLineSource,
} from "@line_bot_v1/line/messaging-api";

export function classifyLineWebhookEvents(
  events: LineWebhookEvent[],
  config: {
    testUserId?: string;
    attendanceMenu: boolean;
    replyAiTest: boolean;
    replyAgent: boolean;
    replyAssistant: boolean;
  },
): {
  selected: SelectedWebhookEvent[];
  senderMismatches: number;
  badRequest: boolean;
} {
  const selected: SelectedWebhookEvent[] = [];
  let senderMismatches = 0;

  for (const event of events) {
    const source = parseLineSource(event.source);
    const attendanceMenu =
      config.attendanceMenu &&
      source?.type === "user" &&
      event.type === "postback" &&
      !!event.postback &&
      typeof event.postback === "object" &&
      "data" in event.postback &&
      event.postback.data === "attendance-menu";
    const { text, imageId, mentionedText, mentioned } = parseLineMessage(event);
    const ai = text === "/ai-test" && config.replyAiTest;
    const agent = !!text && /^\/agent(?:\s|$)/.test(text) && config.replyAgent;

    const privateAssistantText =
      source?.type === "user" &&
      typeof text === "string" &&
      text.length > 0 &&
      text !== "/ping" &&
      !ai &&
      !agent &&
      !attendanceMenu;
    const assistant = config.replyAssistant && (!!imageId || mentioned || privateAssistantText);

    if (text !== "/ping" && !ai && !agent && !assistant && !attendanceMenu) continue;

    if (!source || (config.testUserId && source.userId !== config.testUserId)) {
      senderMismatches++;
      continue;
    }
    if (event.mode === "standby") continue;
    const { scopeId } = source;
    if (assistant && (typeof scopeId !== "string" || !scopeId)) continue;
    if (
      typeof event.webhookEventId !== "string" ||
      !event.webhookEventId ||
      typeof event.replyToken !== "string" ||
      !event.replyToken
    ) {
      return { selected, senderMismatches, badRequest: true };
    }

    const agentInput = agent && text ? text.slice(6).trim() : undefined;
    const assistantText =
      mentioned && mentionedText
        ? mentionedText.trim()
        : privateAssistantText && text
          ? text.trim()
          : undefined;
    const assistantEvent = assistant
      ? {
          scope: `${source.type}:${scopeId}`,
          userId: source.userId,
          ...(imageId ? { imageId } : {}),
          ...(assistantText !== undefined ? { text: assistantText } : {}),
        }
      : undefined;
    selected.push({
      id: event.webhookEventId,
      token: event.replyToken,
      userId: source.userId,
      ai,
      ...(attendanceMenu ? { attendanceMenu } : {}),
      ...(agentInput !== undefined ? { agentInput } : {}),
      ...(assistantEvent ? { assistant: assistantEvent } : {}),
    });
  }

  return { selected, senderMismatches, badRequest: false };
}
