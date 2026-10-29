import {
  createAssistantWebhookRouter,
  type WebhookRouterOutcome,
} from "@line_bot_v1/assistant/application/webhook-router";
import type { LineWebhookEvent } from "@line_bot_v1/line/messaging-api";
import { captureHandledServerError } from "../../../shared/observability/server-error";
import { classifyLineWebhookEvents } from "./line-webhook-intent.server";

/** Decode verified LINE delivery intents; Assistant owns qualification, dispatch and replay. */
export function createLineWebhookRouter(
  config: Omit<
    Parameters<typeof createAssistantWebhookRouter>[0],
    "observeError" | "report" | "authorize"
  > & {
    testUserId?: string;
    authorize?: (userId: string) => boolean | Promise<boolean>;
    report?: (outcome: WebhookRouterOutcome | "sender_mismatch") => void;
  },
) {
  const dispatch = createAssistantWebhookRouter({
    ...config,
    authorize: config.authorize ?? (() => true),
    observeError: (error, context) =>
      captureHandledServerError(error, {
        service: "line-webhook",
        ...context,
      }),
  });
  return async (events: LineWebhookEvent[], idempotencyScope: string): Promise<number> => {
    if (config.testUserId ? !/^U[a-fA-F0-9]{32}$/.test(config.testUserId) : !config.authorize)
      return 503;

    const { selected, senderMismatches, badRequest } = classifyLineWebhookEvents(events, {
      ...(config.testUserId ? { testUserId: config.testUserId } : {}),
      attendanceMenu: !!config.attendanceMenu,
      replyAiTest: !!config.replyAiTest,
      replyAgent: !!config.replyAgent,
      replyAssistant: !!config.replyAssistant,
    });
    for (let index = 0; index < senderMismatches; index++) config.report?.("sender_mismatch");
    if (badRequest) return 400;
    return dispatch(selected, idempotencyScope);
  };
}
