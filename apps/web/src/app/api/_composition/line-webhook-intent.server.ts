import type { WorkplaceChatInput } from "@line-work/attendance/domain";
import {
  type LineWebhookEvent,
  parseLineMessage,
  parseLineSource,
} from "@line-work/line-channel/adapters/messaging";
import type { AssistantEvent } from "../../../modules/assistant/event-router.server";

export type SelectedLineWebhookEvent = {
  id: string;
  token: string;
  userId: string;
  ai: boolean;
  agentInput?: string;
  assistant?: AssistantEvent;
  attendanceMenu?: boolean;
  workplace?: WorkplaceChatInput;
  eventAt?: number;
};

export function classifyLineWebhookEvents(
  events: LineWebhookEvent[],
  config: {
    testUserId?: string;
    attendanceMenu: boolean;
    workplaceChat: boolean;
    workplaceInput?: (text?: string, postback?: string) => WorkplaceChatInput | undefined;
    replyAiTest: boolean;
    replyAgent: boolean;
    replyAssistant: boolean;
  },
): {
  selected: SelectedLineWebhookEvent[];
  senderMismatches: number;
  badRequest: boolean;
} {
  const selected: SelectedLineWebhookEvent[] = [];
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
    const postback =
      event.type === "postback" &&
      event.postback &&
      typeof event.postback === "object" &&
      "data" in event.postback &&
      typeof event.postback.data === "string"
        ? event.postback.data
        : undefined;
    let workplace =
      source?.type === "user" && config.workplaceChat
        ? config.workplaceInput?.(text, postback)
        : undefined;
    const message =
      event.type === "message" && event.message && typeof event.message === "object"
        ? event.message
        : undefined;
    if (
      source?.type === "user" &&
      config.workplaceChat &&
      message &&
      "type" in message &&
      message.type === "location" &&
      "latitude" in message &&
      "longitude" in message &&
      typeof message.latitude === "number" &&
      typeof message.longitude === "number"
    ) {
      workplace = {
        type: "location",
        latitude: message.latitude,
        longitude: message.longitude,
        address: "address" in message && typeof message.address === "string" ? message.address : "",
      };
    }
    if (workplace && (!Number.isSafeInteger(event.timestamp) || Number(event.timestamp) < 0)) {
      return { selected, senderMismatches, badRequest: true };
    }
    const ai = text === "/ai-test" && config.replyAiTest;
    const agent = !!text && /^\/agent(?:\s|$)/.test(text) && config.replyAgent;

    const privateAssistantText =
      source?.type === "user" &&
      typeof text === "string" &&
      text.length > 0 &&
      text !== "/ping" &&
      !ai &&
      !agent &&
      !attendanceMenu &&
      !workplace;
    const assistant = config.replyAssistant && (!!imageId || mentioned || privateAssistantText);

    if (text !== "/ping" && !ai && !agent && !assistant && !attendanceMenu && !workplace) continue;

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

    selected.push({
      id: event.webhookEventId,
      token: event.replyToken,
      userId: source.userId,
      ai,
      attendanceMenu,
      workplace,
      eventAt: workplace ? Number(event.timestamp) : undefined,
      agentInput: agent ? text!.slice(6).trim() : undefined,
      assistant: assistant
        ? {
            scope: `${source.type}:${scopeId}`,
            userId: source.userId,
            imageId,
            text: mentioned
              ? mentionedText!.trim()
              : privateAssistantText
                ? text!.trim()
                : undefined,
          }
        : undefined,
    });
  }

  return { selected, senderMismatches, badRequest: false };
}
