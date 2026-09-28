import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { createLineWebhookIngress } from "../src/app/api/_composition/line-webhook.server";
import { createLineWebhookRouter as createLineWebhookRouterImpl } from "../src/app/api/_composition/line-webhook-router.server";
import {
  workplaceChatInput,
  workplaceChatMessage,
} from "../src/modules/attendance/workplace-chat.server";
import { idempotencyFixture } from "./idempotency-fixture.js";

const bot = `U${"2".repeat(32)}`;
type TestWebhookConfig = Parameters<typeof createLineWebhookRouterImpl>[0] & {
  channelSecret: string;
};
const createTestWebhook = (config: TestWebhookConfig) => {
  const { channelSecret, ...routerConfig } = config;
  return createLineWebhookIngress({
    channelSecret,
    handleEvents: createLineWebhookRouterImpl(routerConfig),
  });
};

test("private signed workplace events route once; group/location/unknown traffic stays isolated", async () => {
  const seen: string[] = [];
  const fixture = idempotencyFixture();
  const handle = createTestWebhook({
    channelSecret: "secret",
    idempotency: () => fixture,
    authorize: async () => true,
    reply: async () => {
      throw Error("unexpected");
    },
    workplaceInput: workplaceChatInput,
    workplaceChat: async (_token, _subject, id, _time, input) => {
      seen.push(`${id}:${input.type}`);
      return false;
    },
  });
  const event = {
    type: "message",
    webhookEventId: "start",
    replyToken: "token",
    timestamp: 1000,
    source: { type: "user", userId: `U${"1".repeat(32)}` },
    message: { type: "text", text: "新增打卡地點 辦公室" },
  };
  const send = (events: unknown[], valid = true) => {
    const body = JSON.stringify({ destination: bot, events });
    return handle(
      new Request("http://localhost/api/line/webhook", {
        method: "POST",
        body,
        headers: {
          "x-line-signature": valid
            ? createHmac("sha256", "secret").update(body).digest("base64")
            : "bad",
        },
      }),
    );
  };
  assert.equal((await send([event], false)).status, 401);
  assert.equal((await send([event])).status, 200);
  await send([event]);
  await send([
    {
      ...event,
      webhookEventId: "group",
      source: { ...event.source, type: "group", groupId: "group" },
    },
  ]);
  await send([{ ...event, webhookEventId: "ordinary", message: { type: "text", text: "你好" } }]);
  await send([
    {
      ...event,
      webhookEventId: "location",
      message: { type: "location", latitude: 25, longitude: 121, address: "入口" },
    },
  ]);
  assert.deepEqual(seen, ["start:start", "location:location"]);
  await send([
    {
      ...event,
      webhookEventId: "batch-location",
      timestamp: 2001,
      message: { type: "location", latitude: 25, longitude: 121 },
    },
    { ...event, webhookEventId: "batch-start", timestamp: 2000 },
  ]);
  assert.deepEqual(seen.slice(-2), ["batch-start:start", "batch-location:location"]);
});

test("command parsing and native location/radius actions need no map API", () => {
  assert.deepEqual(workplaceChatInput("新增打卡地點 台北辦公室"), {
    type: "start",
    name: "台北辦公室",
  });
  assert.deepEqual(workplaceChatInput("半徑 150"), { type: "radius", radius: 150 });
  assert.equal(workplaceChatInput("你好"), undefined);
  const draft = {
    id: "00000000-0000-4000-8000-000000000001",
    revision: 1,
    name: "Office",
    phase: "location" as const,
    radius: 100,
    expiresAt: 99999,
    lastEventAt: 1,
  };
  const message = workplaceChatMessage({ draft }, "https://miniapp.line.me/123-test");
  assert.equal(message!.quickReply!.items![0]!.action!.type, "location");
  const radius = workplaceChatMessage(
    { draft: { ...draft, phase: "radius" } },
    "https://miniapp.line.me/123-test",
  )!;
  const action = radius.quickReply!.items![1]!.action!;
  assert.equal(action.type, "postback");
  if (action.type === "postback")
    assert.deepEqual(workplaceChatInput(undefined, action.data), {
      type: "radius",
      token: `${draft.id}:1`,
      radius: 100,
    });
});
