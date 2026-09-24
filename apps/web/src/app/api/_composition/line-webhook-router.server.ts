import type { WorkplaceChatInput } from "@line-work/attendance/domain";
import {
  type LineWebhookEvent,
  parseLineMessage,
  parseLineSource,
} from "@line-work/line-channel/adapters/messaging";
import type { RedisIdempotencyStore } from "@line-work/platform/adapters/redis";
import type { AssistantEvent } from "../../../modules/assistant/event-router.server";
import { captureHandledServerError } from "../../../shared/observability/server-error";

/**
 * 已通過 LINE transport verification 的事件路由器。
 * 本 composition 只決定 Web 互動 intent、User qualification、去重與功能 dispatch；
 * 不擁有 raw body、signature 或 Webhook destination。
 */
export type WebhookIdempotencyStore = Pick<RedisIdempotencyStore, "claim" | "complete">;

type LineWebhookRouterOutcome =
  | "replied"
  | "handled_silently"
  | "reply_failed"
  | "idempotency_unavailable"
  | "sender_mismatch";

export function createLineWebhookRouter(config: {
  idempotency(): WebhookIdempotencyStore;
  testUserId?: string;
  authorize?: (userId: string) => boolean | Promise<boolean>;
  replyMembership?: (replyToken: string, userId: string) => Promise<unknown>;
  replyUnavailable?: (replyToken: string, error: unknown) => Promise<unknown>;
  reply: (replyToken: string) => Promise<unknown>;
  replyAiTest?: (replyToken: string) => Promise<unknown>;
  replyAgent?: (replyToken: string, input: string) => Promise<unknown>;
  replyAssistant?: (replyToken: string, event: AssistantEvent) => Promise<unknown>;
  attendanceMenu?: (userId: string) => Promise<void>;
  workplaceChat?: (
    token: string,
    subject: string,
    eventId: string,
    eventAt: number,
    input: WorkplaceChatInput,
  ) => Promise<unknown>;
  workplaceInput?: (text?: string, postback?: string) => WorkplaceChatInput | undefined;
  report?: (outcome: LineWebhookRouterOutcome) => void;
}) {
  return async (events: LineWebhookEvent[], idempotencyScope: string): Promise<number> => {
    if (config.testUserId ? !/^U[a-fA-F0-9]{32}$/.test(config.testUserId) : !config.authorize)
      return 503;

    const selected: {
      id: string;
      token: string;
      userId: string;
      ai: boolean;
      agentInput?: string;
      assistant?: AssistantEvent;
      attendanceMenu?: boolean;
      workplace?: WorkplaceChatInput;
      eventAt?: number;
    }[] = [];

    for (const event of events) {
      const source = parseLineSource(event.source);
      const attendanceMenu =
        !!config.attendanceMenu &&
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
      )
        workplace = {
          type: "location",
          latitude: message.latitude,
          longitude: message.longitude,
          address:
            "address" in message && typeof message.address === "string" ? message.address : "",
        };
      if (workplace && (!Number.isSafeInteger(event.timestamp) || Number(event.timestamp) < 0))
        return 400;
      const ai = text === "/ai-test" && !!config.replyAiTest;
      const agent = !!text && /^\/agent(?:\s|$)/.test(text) && !!config.replyAgent;

      const privateAssistantText =
        source?.type === "user" &&
        typeof text === "string" &&
        text.length > 0 &&
        text !== "/ping" &&
        !ai &&
        !agent &&
        !attendanceMenu &&
        !workplace;
      const assistant = !!config.replyAssistant && (!!imageId || mentioned || privateAssistantText);

      if (text !== "/ping" && !ai && !agent && !assistant && !attendanceMenu && !workplace)
        continue;

      if (!source || (config.testUserId && source.userId !== config.testUserId)) {
        config.report?.("sender_mismatch");
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
      )
        return 400;

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

    const runEvent = async ({
      id,
      token,
      userId,
      ai,
      agentInput,
      assistant,
      attendanceMenu,
      workplace,
      eventAt,
    }: (typeof selected)[number]) => {
      try {
        const store = config.idempotency();
        const claim = await store.claim(idempotencyScope, id);
        if (claim.state === "completed") return claim.status;
        if (claim.state === "pending") return 503;

        let status = 200;
        try {
          const execute = async () => {
            let authorized = true;
            try {
              authorized = config.authorize ? await config.authorize(userId) : true;
            } catch (error) {
              captureHandledServerError(error, {
                service: "line-webhook",
                operation: "user-authorization",
                status: 503,
              });
              if (assistant?.imageId || workplace?.type === "location") return false;
              if (config.replyUnavailable) return config.replyUnavailable(token, error);
              throw new Error("Authorization service unavailable", { cause: error });
            }
            if (!authorized) {
              return assistant?.imageId || workplace?.type === "location"
                ? false
                : config.replyMembership
                  ? config.replyMembership(token, userId)
                  : false;
            }
            if (attendanceMenu) {
              await config.attendanceMenu!(userId);
              return false;
            }
            if (workplace) return config.workplaceChat!(token, userId, id, eventAt!, workplace);
            return assistant
              ? config.replyAssistant!(token, assistant)
              : agentInput !== undefined
                ? config.replyAgent!(token, agentInput)
                : ai
                  ? config.replyAiTest!(token)
                  : config.reply(token);
          };
          const result = await execute();
          config.report?.(result === false ? "handled_silently" : "replied");
        } catch (error) {
          status = 502;
          captureHandledServerError(error, {
            service: "line-webhook",
            operation: "reply",
            status,
          });
          config.report?.("reply_failed");
        }
        return (await store.complete(idempotencyScope, id, claim.token, status)) ? status : 503;
      } catch (error) {
        captureHandledServerError(error, {
          service: "line-webhook",
          operation: "idempotency",
          status: 503,
        });
        config.report?.("idempotency_unavailable");
        return 503;
      }
    };

    const turns = new Map<string, Promise<unknown>>();
    const results = selected
      .sort((a, b) => (a.eventAt ?? 0) - (b.eventAt ?? 0))
      .map((event) => {
        if (!event.workplace) return runEvent(event);
        const previous = turns.get(event.userId) ?? Promise.resolve();
        const result = previous.then(() => runEvent(event));
        turns.set(event.userId, result);
        return result;
      });

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.all(results).then((values) => values.find((value) => value !== 200) ?? 200),
        new Promise<number>((resolve) => {
          timer = setTimeout(
            () => resolve(503),
            selected.some((event) => event.agentInput !== undefined || event.assistant)
              ? 20_000
              : 10_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}
