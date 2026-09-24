import { randomUUID } from "node:crypto";
import { UserError } from "@line-work/account/domain/user";
import { PostgresWorkplaceChatStore } from "@line-work/attendance/adapters/postgres";
import { createWorkplaceChat } from "@line-work/attendance/application/workplace-chat";
import { createLineClient } from "@line-work/line-channel/adapters/messaging";
import {
  createUpstashRedisRestTransport,
  RedisIdempotencyStore,
  RedisUnavailableError,
  redisUnavailableCode,
} from "@line-work/platform/adapters/redis";
import { membershipFailureCode } from "../../../modules/account/failure-code.server";
import { agentText, aiTestText, answer } from "../../../modules/assistant/answer.server";
import { createAssistantReply } from "../../../modules/assistant/event-router.server";
import { membershipMessage } from "../../../modules/assistant/response-presenter.server";
import {
  workplaceChatInput,
  workplaceChatMessage,
} from "../../../modules/attendance/workplace-chat.server";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { redisNamespace } from "../../../shared/server/runtime-environment";
import { activeLineUser, findUser } from "./account.server";
import { showAttendanceMenu } from "./attendance.server";
import { receiptIntake } from "./expense.server";
import { createLineWebhookIngress } from "./line-webhook.server";
import {
  createLineWebhookRouter,
  type WebhookIdempotencyStore,
} from "./line-webhook-router.server";

function webhookRedisTransport() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new RedisUnavailableError("configuration");
  return createUpstashRedisRestTransport(url, token);
}

export function createLineWebhookHandler(channelSecret: string) {
  const miniApp = lineMiniApp();
  const line = createLineClient({ channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN! });
  const chat = createWorkplaceChat({
    activeUser: activeLineUser,
    store: () => new PostgresWorkplaceChatStore(),
    now: Date.now,
    uuid: randomUUID,
  });
  const handleEvents = createLineWebhookRouter({
    idempotency: () => {
      try {
        const state = globalThis as typeof globalThis & {
          lineIdempotency?: WebhookIdempotencyStore;
        };
        return (state.lineIdempotency ??= new RedisIdempotencyStore(
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
    workplaceInput: workplaceChatInput,
    workplaceChat: async (token, subject, eventId, eventAt, input) => {
      try {
        const result = await chat(subject, eventId, eventAt, input);
        if (
          input.type === "location" &&
          (!result.draft ||
            result.draft.expiresAt <= Date.now() ||
            ["saved", "cancelled"].includes(result.draft.phase))
        ) {
          return false;
        }
        const message = workplaceChatMessage(result, miniApp.url);
        return message ? line.replyMessage({ replyToken: token, messages: [message] }) : false;
      } catch (error) {
        if (!(error instanceof UserError)) throw error;
        if (input.type === "location") return false;
        return line.replyMessage({
          replyToken: token,
          messages: [{ type: "text", text: error.message }],
        });
      }
    },
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
            text: `會員服務暫不可用（錯誤代碼：${membershipFailureCode(error)}）。請稍後再試；不需要重新註冊。`,
          },
        ],
      }),
    replyMembership: async (token, userId) =>
      line.replyMessage({
        replyToken: token,
        messages: [membershipMessage((await findUser(userId))?.status, miniApp.url)],
      }),
    replyAssistant: createAssistantReply({
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
