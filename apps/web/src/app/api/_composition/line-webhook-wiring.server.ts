import { UserError } from "@line_bot_v1/account/domain/user";
import { createAssistantReply } from "@line_bot_v1/assistant/application/reply";
import type { ReceiptIntakeResult } from "@line_bot_v1/expense/application/receipt-intake";
import { createLineClient, type messagingApi } from "@line_bot_v1/line/messaging-api";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import {
  createUpstashRedisRestTransport,
  RedisIdempotencyStore,
  RedisUnavailableError,
  redisUnavailableCode,
} from "@line_bot_v1/platform/redis";
import { membershipFailureCode } from "../../../modules/account/failure-code.server";
import {
  attendanceMessage,
  diaryMessage,
  membershipMessage,
  receiptMessage,
  textMessage,
} from "../../../modules/assistant/response-presenter.server";
import { redisNamespace } from "../../../shared/server/runtime-environment";
import { activeLineUser, findUser } from "./account.server";
import { agentText, aiTestText, answer } from "./assistant.server";
import { showAttendanceMenu } from "./attendance.server";
import { receiptIntake } from "./expense.server";
import { createLineWebhookIngress } from "./line-webhook.server";
import { createLineWebhookRouter } from "./line-webhook-router.server";

function webhookRedisTransport() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new RedisUnavailableError("configuration");
  return createUpstashRedisRestTransport(url, token);
}

export function createLineWebhookHandler(channelSecret: string) {
  const miniApp = lineMiniApp();
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is required");
  const line = createLineClient({ channelAccessToken });
  const handleEvents = createLineWebhookRouter({
    idempotency: () => {
      try {
        return (globalThis.lineIdempotency ??= new RedisIdempotencyStore(
          redisNamespace(),
          webhookRedisTransport(),
        ));
      } catch (error) {
        console.warn(
          JSON.stringify({
            service: "webhook-idempotency",
            outcome: "unavailable",
            code: redisUnavailableCode(error),
          }),
        );
        throw error;
      }
    },
    attendanceMenu: showAttendanceMenu,
    authorize: async (userId) => {
      try {
        await activeLineUser(userId);
        return true;
      } catch (error) {
        if (error instanceof UserError && error.status === 403) return false;
        console.warn(
          JSON.stringify({
            service: "membership",
            outcome: "service_unavailable",
            code: membershipFailureCode(error),
          }),
        );
        throw error;
      }
    },
    replyUnavailable: (token, error) =>
      line.replyMessage({
        replyToken: token,
        messages: [
          {
            type: "text",
            text: error instanceof Error ? error.message : String(error),
          },
        ],
      }),
    replyMembership: async (token, userId) =>
      line.replyMessage({
        replyToken: token,
        messages: [membershipMessage((await findUser(userId))?.status, miniApp.url)],
      }),
    replyAssistant: createAssistantReply<ReceiptIntakeResult, messagingApi.Message>({
      receiptMessage,
      attendanceMessage,
      diaryMessage,
      textMessage,
      receiptIntake,
      activeUser: activeLineUser,
      answer,
      miniAppUrl: () => miniApp.url,
      reply: (token, message) => line.replyMessage({ replyToken: token, messages: [message] }),
    }),
    replyAgent: async (token, input) =>
      line.replyMessage({
        replyToken: token,
        messages: [{ type: "text", text: await agentText(input) }],
      }),
    replyAiTest: async (token) =>
      line.replyMessage({
        replyToken: token,
        messages: [{ type: "text", text: await aiTestText() }],
      }),
    reply: (token) =>
      line.replyMessage({
        replyToken: token,
        messages: [{ type: "text", text: "pong ✅ 本地 LINE Bot 已連線。" }],
      }),
    report: (outcome) => console.info(JSON.stringify({ service: "line-local", outcome })),
  });
  return createLineWebhookIngress({
    channelSecret,
    handleEvents,
    report: (outcome) => console.info(JSON.stringify({ service: "line-local", outcome })),
  });
}
