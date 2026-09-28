/**
 * ============================================================================
 * 第一性原理分析：LINE Webhook 事件管線與提及過濾單元測試 (Local Webhook Unit Tests)
 * ============================================================================
 *
 * 1. 根本問題 (Root Problem):
 *    群組訊息量龐大且充斥私人對話。若 Webhook 未能精確判斷原生提及、簽章真偽與身分去重，
 *    將引發群聊隱私洩漏、事件重放攻擊 (Replay Attack) 與未經授權的助理喚醒。
 *
 * 2. 核心公理與過濾不變量 (Core Axioms & Filter Invariants):
 *    - 【原生提及真偽判定 (Native Mention Verification)】：
 *      僅當訊息包含 LINE 原生 `mention.mentionees` 且標記 `isSelf: true` 時方認定為喚醒；
 *      純字串文字符合 `@助手` 但無官方 metadata 標記者判定為假冒，一律忽略。
 *    - 【事件去重公理 (Event Deduplication)】：
 *      同一 `webhookEventId` 僅處理一次，防止網路重送造成重複執行。
 *    - 【簽章無效即刻拒絕】：簽章不符之請求一律拋棄，不執行任何後續邏輯。
 * ============================================================================
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  createLineWebhookIngress,
  type LineWebhookIngressOutcome,
} from "../src/app/api/_composition/line-webhook.server";
import { createLineWebhookRouter as createLineWebhookRouterImpl } from "../src/app/api/_composition/line-webhook-router.server";
import { idempotencyFixture } from "./idempotency-fixture.js";

const secret = "offline-secret";
const tester = `U${"1".repeat(32)}`;
const bot = `U${"2".repeat(32)}`;
type TestWebhookConfig = Parameters<typeof createLineWebhookRouterImpl>[0] & {
  channelSecret?: string;
  ingressReport?: (outcome: LineWebhookIngressOutcome) => void;
};
const createTestWebhook = (config: TestWebhookConfig) => {
  const { channelSecret = secret, ingressReport, ...routerConfig } = config;
  return createLineWebhookIngress({
    channelSecret,
    handleEvents: createLineWebhookRouterImpl(routerConfig),
    report: ingressReport,
  });
};
const event = (id = "one") => ({
  type: "message",
  webhookEventId: id,
  replyToken: id,
  source: { type: "user", userId: tester },
  message: { type: "text", text: "/ping" },
});
const request = (body: unknown, valid = true, destination = bot) => {
  const raw =
    typeof body === "string" ? body : JSON.stringify({ destination, ...(body as object) });
  return new Request("http://localhost/api/line/webhook", {
    method: "POST",
    body: raw,
    headers: {
      "x-line-signature": valid
        ? createHmac("sha256", secret).update(raw).digest("base64")
        : "invalid",
    },
  });
};

test("verified event routing remains independent from LINE transport admission", async () => {
  let replies = 0;
  const idempotency = idempotencyFixture();
  const route = createLineWebhookRouterImpl({
    idempotency: () => idempotency,
    testUserId: tester,
    reply: async () => {
      replies++;
    },
  });
  assert.equal(await route([event("router-only")], "verified-channel"), 200);
  assert.equal(replies, 1);
});

test("attendance menu postbacks require signed private-chat member events and never clock automatically", async () => {
  const called: string[] = [];
  let authorizations = 0;
  let active = true;
  const fixture = idempotencyFixture();
  let claims = 0;
  const idempotency = {
    claim: async (scope: string, id: string) => {
      claims++;
      return fixture.claim(scope, id);
    },
    complete: fixture.complete,
  };
  const handle = createTestWebhook({
    channelSecret: secret,
    idempotency: () => idempotency,
    authorize: async () => {
      authorizations++;
      return active;
    },
    reply: async () => {
      throw Error("unexpected reply");
    },
    attendanceMenu: async (subject) => {
      called.push(subject);
    },
  });
  const menu = { ...event("menu"), type: "postback", postback: { data: "attendance-menu" } };
  const nativeSwitch = {
    ...event("native-switch"),
    type: "postback",
    postback: { data: "menu=attendance-in" },
  };
  assert.equal((await handle(request({ events: [menu] }, false))).status, 401);
  await handle(
    request({ events: [{ ...menu, source: { type: "group", groupId: "group", userId: tester } }] }),
  );
  assert.deepEqual(called, []);
  assert.equal((await handle(request({ events: [nativeSwitch] }))).status, 200);
  assert.equal(authorizations, 0, "native richmenuswitch data must not authorize attendance");
  assert.equal(claims, 0, "native richmenuswitch data must not claim webhook work");
  assert.equal((await handle(request({ events: [menu] }))).status, 200);
  await handle(request({ events: [menu] }));
  assert.deepEqual(called, [tester]);
  active = false;
  await handle(request({ events: [{ ...menu, webhookEventId: "inactive" }] }));
  assert.deepEqual(called, [tester]);
});
test("native self mentions and images are signed, authorized and deduplicated; unrelated receipt postbacks are ignored", async () => {
  const events: string[] = [];
  const idempotency = idempotencyFixture();
  const handle = createTestWebhook({
    idempotency: () => idempotency,
    channelSecret: secret,
    testUserId: tester,
    reply: async () => {},
    replyAssistant: async (_, event) => {
      events.push(event.imageId ?? event.text ?? "");
    },
  });
  const img = { ...event("image"), message: { type: "image", id: "123" } };
  await handle(request({ events: [img] }, false));
  await handle(request({ events: [{ ...img, source: { type: "user", userId: "other" } }] }));
  assert.deepEqual(events, []);
  await handle(
    request({
      events: [
        img,
        img,
        {
          ...event("post"),
          type: "postback",
          postback: { data: "receipt:0123456789:1:recognize" },
        },
      ],
    }),
  );
  assert.deepEqual(events, ["123"]);
  const mention = {
    ...event("mention"),
    message: {
      type: "text",
      text: "@助手 今天幾號",
      mention: { mentionees: [{ type: "user", isSelf: true, index: 0, length: 3 }] },
    },
  };
  await handle(
    request({
      events: [
        mention,
        mention,
        {
          ...event("fake"),
          source: { type: "group", groupId: `C${"3".repeat(32)}`, userId: tester },
          message: { type: "text", text: "@助手 今天幾號" },
        },
      ],
    }),
  );
  assert.deepEqual(events, ["123", "今天幾號"]);
  await handle(
    request({
      events: [
        {
          ...mention,
          webhookEventId: "other",
          source: { type: "group", groupId: `C${"3".repeat(32)}`, userId: tester },
          message: {
            ...mention.message,
            mention: { mentionees: [{ type: "user", isSelf: false, index: 0, length: 3 }] },
          },
        },
      ],
    }),
  );
  assert.deepEqual(events, ["123", "今天幾號"]);
});
test("private text is conversational while group text requires a native self mention", async () => {
  const inputs: string[] = [];
  const idempotency = idempotencyFixture();
  const handle = createTestWebhook({
    idempotency: () => idempotency,
    channelSecret: secret,
    testUserId: tester,
    reply: async () => {},
    replyAssistant: async (_, assistant) => {
      inputs.push(`${assistant.scope}|${assistant.text ?? ""}`);
    },
  });
  const groupId = `C${"3".repeat(32)}`;
  await handle(
    request({
      events: [
        { ...event("private-chat"), message: { type: "text", text: "今天幾號" } },
        {
          ...event("group-chat"),
          source: { type: "group", groupId, userId: tester },
          message: { type: "text", text: "今天幾號" },
        },
        {
          ...event("group-mention"),
          source: { type: "group", groupId, userId: tester },
          message: {
            type: "text",
            text: "@助手 今天幾號",
            mention: { mentionees: [{ type: "user", isSelf: true, index: 0, length: 3 }] },
          },
        },
      ],
    }),
  );
  assert.deepEqual(inputs, [`user:${tester}|今天幾號`, `group:${groupId}|今天幾號`]);
});

test("raw signature, malformed envelope, signed destination metadata, ignored events and body limit", async () => {
  let calls = 0;
  const idempotency = idempotencyFixture();
  const handle = createTestWebhook({
    idempotency: () => idempotency,
    channelSecret: secret,
    testUserId: tester,
    reply: async () => {
      calls++;
    },
  });
  assert.equal((await handle(request("invalid-json", false))).status, 401);
  assert.equal((await handle(request("invalid-json"))).status, 400);
  assert.equal((await handle(request({ events: [null] }))).status, 400);
  assert.equal((await handle(request({ events: [] }))).status, 200);
  assert.equal((await handle(request({ events: [] }, true, `U${"3".repeat(32)}`))).status, 200);
  assert.equal(
    (
      await handle(
        request({
          events: [
            { ...event(), source: { type: "group", userId: "other" } },
            { ...event(), message: { type: "text", text: "聊天" } },
          ],
        }),
      )
    ).status,
    200,
  );
  assert.equal((await handle(request("x".repeat(1_048_577)))).status, 413);
  assert.equal(calls, 0);
});
test("concurrent deliveries and partial success never repeat an attempted reply through shared idempotency", async () => {
  const calls: string[] = [];
  const idempotency = idempotencyFixture();
  const handle = createTestWebhook({
    idempotency: () => idempotency,
    channelSecret: secret,
    testUserId: tester,
    reply: async (token) => {
      calls.push(token);
      if (token === "two") throw new Error("secret error must not escape");
    },
  });
  const payload = { events: [event(), event("two")] };
  const responses = await Promise.all([handle(request(payload)), handle(request(payload))]);
  assert.deepEqual(
    responses.map((r) => r.status),
    [502, 503],
  );
  assert.equal((await handle(request({ events: [event()] }))).status, 200);
  assert.deepEqual(calls, ["one", "two"]);
  assert.equal(await responses[0]!.text(), "");
});

test("two webhook instances share claims, and Redis outages prevent side effects", async () => {
  const shared = idempotencyFixture();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let calls = 0;
  const config = {
    channelSecret: secret,
    testUserId: tester,
    idempotency: () => shared,
    reply: async () => {
      calls++;
      entered();
      await pending;
    },
  };
  const first = createTestWebhook(config);
  const second = createTestWebhook(config);
  const work = first(request({ events: [event("shared")] }));
  await started;
  assert.equal((await second(request({ events: [event("shared")] }))).status, 503);
  release();
  assert.equal((await work).status, 200);
  assert.equal((await second(request({ events: [event("shared")] }))).status, 200);
  assert.equal(calls, 1);
  const outcomes: string[] = [];
  const report = (outcome: string) => outcomes.push(outcome);
  const unavailable = createTestWebhook({
    ...config,
    report,
    ingressReport: report,
    idempotency: () => {
      throw new Error("redis unavailable");
    },
  });
  assert.equal((await unavailable(request({ events: [event("unavailable")] }))).status, 503);
  assert.deepEqual(outcomes, ["events_received", "idempotency_unavailable"]);
  assert.equal((await unavailable(request({ events: [] }))).status, 200);
  assert.equal((await unavailable(request({ events: [event()] }, false))).status, 401);
  assert.equal(calls, 1);
});

test("AI probe is explicit, authorized and deduplicated; ping remains independent", async () => {
  let ai = 0;
  let ping = 0;
  const idempotency = idempotencyFixture();
  const handle = createTestWebhook({
    idempotency: () => idempotency,
    channelSecret: secret,
    testUserId: tester,
    reply: async () => {
      ping++;
    },
    replyAiTest: async () => {
      ai++;
    },
  });
  const probe = { ...event("ai"), message: { type: "text", text: "/ai-test" } };
  await handle(request({ events: [{ ...probe, source: { type: "group", userId: "other" } }] }));
  assert.equal(ai, 0);
  await handle(request({ events: [probe, probe, event()] }));
  assert.equal(ai, 1);
  assert.equal(ping, 1);
});

test("agent gets only explicit command input, after authorization and deduplication", async () => {
  const inputs: string[] = [];
  const idempotency = idempotencyFixture();
  const handle = createTestWebhook({
    idempotency: () => idempotency,
    channelSecret: secret,
    testUserId: tester,
    reply: async () => {},
    replyAgent: async (_, input) => {
      inputs.push(input);
    },
  });
  const command = { ...event("agent"), message: { type: "text", text: "/agent 明天下午檢查設備" } };
  await handle(request({ events: [{ ...command, source: { type: "group", userId: "other" } }] }));
  assert.deepEqual(inputs, []);
  await handle(
    request({
      events: [
        command,
        command,
        { ...event("ordinary"), message: { type: "text", text: "明天下午檢查設備" } },
      ],
    }),
  );
  assert.deepEqual(inputs, ["明天下午檢查設備"]);
});
