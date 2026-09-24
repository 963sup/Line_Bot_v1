import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mock, test } from "node:test";
import { POST } from "../src/app/api/line/webhook/route";
import {
  activateMember,
  closeFixture,
  expenseStore,
  memberStore,
  mockSupabase,
} from "./member-fixture";

test("real webhook composition: mentions answer, ordinary images are silent, one armed image yields only one action entry", async () => {
  const user = `U${"1".repeat(32)}`;
  const botDestination = `U${"9".repeat(32)}`;
  Object.assign(process.env, {
    LINE_CHANNEL_SECRET: "offline-secret",
    LINE_CHANNEL_ACCESS_TOKEN: "offline-token",
    LINE_PROVIDER_ID: "test-provider",
  });
  await mockSupabase();
  const memberId = await activateMember(user);
  const fetchOriginal = globalThis.fetch;
  const sent: { messages: unknown[] }[] = [];
  globalThis.fetch = (async (input, init) => {
    if (!String(input).endsWith("/message/reply"))
      throw new Error("No AI or image download expected");
    sent.push(JSON.parse(String(init?.body)));
    return Response.json({ sentMessages: [] });
  }) as typeof fetch;
  let index = 0;
  const deliver = async (
    message: unknown,
    owner = user,
    groupId = "group-A",
    destination = botDestination,
  ) => {
    const raw = JSON.stringify({
      destination,
      events: [
        {
          type: "message",
          mode: "active",
          source: { type: "group", groupId, userId: owner },
          webhookEventId: `event-${++index}`,
          replyToken: `token-${index}`,
          message,
        },
      ],
    });
    return POST(
      new Request("http://localhost/api/line/webhook", {
        method: "POST",
        body: raw,
        headers: {
          "x-line-signature": createHmac("sha256", "offline-secret").update(raw).digest("base64"),
        },
      }),
    );
  };
  const mention = (text: string) => ({
    type: "text",
    text: `@助手 ${text}`,
    mention: { mentionees: [{ type: "user", isSelf: true, index: 0, length: 3 }] },
  });
  try {
    const unknownDestination = `U${"8".repeat(32)}`;
    assert.equal(
      (await deliver({ type: "text", text: "一般聊天" }, user, "group-A", unknownDestination))
        .status,
      200,
    );
    assert.equal(sent.length, 0);

    await deliver({ type: "image", id: "100" });
    assert.equal(sent.length, 0);
    await deliver({ type: "text", text: "@助手 記帳" });
    assert.equal(sent.length, 0);
    assert.equal((await deliver(mention("今天幾號"))).status, 200);
    assert.equal(sent.length, 1);
    assert.match(JSON.stringify(sent[0]), /星期/);
    await deliver(mention("記帳"));
    assert.equal(sent.length, 2);
    await deliver({ type: "image", id: "101" }, "other");
    assert.equal(sent.length, 2);
    await deliver({ type: "image", id: "102" });
    assert.equal(sent.length, 3);
    assert.match(JSON.stringify(sent[2]), /待處理/);
    assert.doesNotMatch(JSON.stringify(sent[2]), /postback|付款|商家/);
    await deliver({ type: "image", id: "102" });
    await deliver({ type: "image", id: "103" });
    assert.equal(sent.length, 3);
    await deliver({ type: "text", text: "日誌" });
    await deliver(mention("日誌"), "other");
    assert.equal(sent.length, 3);
    await deliver(mention("填寫日誌"));
    assert.equal(sent.length, 4);
    assert.deepEqual(sent[3]?.messages, [
      {
        type: "template",
        altText: "填寫日誌：https://forms.gle/VKqVpTZtr8K3oL8a8",
        template: {
          type: "buttons",
          text: "前往 Google 表單填寫日誌；如需登入，請使用自己的 Google 帳號。",
          actions: [{ type: "uri", label: "填寫日誌", uri: "https://forms.gle/VKqVpTZtr8K3oL8a8" }],
        },
      },
    ]);
    await deliver({ type: "image", id: "104" });
    assert.equal(sent.length, 4);
    await deliver(mention("打卡"));
    assert.match(JSON.stringify(sent.at(-1)), /選擇上班或下班/);
    assert.match(JSON.stringify(sent.at(-1)), /clockIn=1/);
    assert.match(JSON.stringify(sent.at(-1)), /clockOut=1/);
    sent.pop();
    await deliver(mention("上班"));
    assert.match(JSON.stringify(sent.at(-1)), /clockIn=1/);
    assert.doesNotMatch(JSON.stringify(sent.at(-1)), /clockOut=1/);
    sent.pop();
    await deliver(mention("下班"));
    assert.match(JSON.stringify(sent.at(-1)), /clockOut=1/);
    assert.doesNotMatch(JSON.stringify(sent.at(-1)), /clockIn=1/);
    sent.pop();
    // Exercise cancellation and entry configuration through the actual route.
    await deliver(mention("記帳"));
    await deliver(mention("取消"));
    assert.match(JSON.stringify(sent.at(-1)), /已取消收件/);
    const afterCancel = sent.length;
    await deliver({ type: "image", id: "cancelled-image" });
    assert.equal(sent.length, afterCancel);
    await expenseStore().arm("group:group-A", memberId, Date.now() - 120_001);
    await deliver({ type: "image", id: "expired-image" });
    assert.equal(sent.length, afterCancel);
    const otherMember = `U${"3".repeat(32)}`;
    await activateMember(otherMember);
    await deliver(mention("記帳"));
    const armedCount = sent.length;
    await deliver({ type: "image", id: "wrong-group" }, user, "group-B");
    await deliver({ type: "image", id: "wrong-owner" }, otherMember);
    assert.equal(sent.length, armedCount);
    await deliver({ type: "image", id: "correct-scope-owner" });
    assert.equal(sent.length, armedCount + 1);
    assert.match(JSON.stringify(sent.at(-1)), /待處理/);
    sent.splice(4);
    const newcomer = `U${"2".repeat(32)}`;
    await deliver({ type: "text", text: "一般聊天" }, newcomer);
    await deliver({ type: "image", id: "105" }, newcomer);
    assert.equal(sent.length, 4);
    await deliver(mention("記帳"), newcomer);
    assert.equal(sent.length, 5);
    assert.match(JSON.stringify(sent[4]), /register=1/);
    await deliver({ type: "text", text: "/agent 明天開會" }, newcomer);
    assert.equal(sent.length, 6);
    assert.match(JSON.stringify(sent[5]), /註冊/);
    const outage = mock.method(memberStore(), "find", async () => {
      throw new Error("offline database");
    });
    await deliver(mention("今天幾號"));
    assert.match(JSON.stringify(sent.at(-1)), /會員服務暫不可用/);
    assert.match(JSON.stringify(sent.at(-1)), /錯誤代碼：unknown/);
    assert.doesNotMatch(JSON.stringify(sent.at(-1)), /register=1/);
    sent.pop();
    outage.mock.restore();
    await memberStore().pause(memberId);
    await deliver({ type: "text", text: "/ai-test" });
    assert.equal(sent.length, 7);
    assert.match(JSON.stringify(sent[6]), /restore=1/);
    await memberStore().suspend(memberId);
    await deliver(mention("今天幾號"));
    assert.equal(sent.length, 8);
    assert.match(JSON.stringify(sent[7]), /聯絡管理者/);
  } finally {
    globalThis.fetch = fetchOriginal;
    await closeFixture();
  }
});
