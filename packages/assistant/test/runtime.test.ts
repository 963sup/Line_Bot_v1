import assert from "node:assert/strict";
import { test } from "node:test";
import { createAssistantReply } from "../src/application/reply.js";
import { createAssistantRuntime } from "../src/application/runtime.js";
import { runAssistantSurface } from "../src/application/surface.js";

test("agent, answer and probe share the existing cooldown without executing a second provider", async (t) => {
  let now = 100_000;
  t.mock.method(Date, "now", () => now);
  const calls: string[] = [];
  const runtime = createAssistantRuntime({
    presentAnswer: (result) => result.type,
    isConfigured: () => true,
    generate: async () => {
      calls.push("generate");
      return "answer";
    },
    runAgent: async () => {
      calls.push("agent");
      return { text: "draft", toolCalls: [] };
    },
    probe: async () => {
      calls.push("probe");
      return "connected";
    },
  });
  assert.equal(await runtime.agentText("draft an issue"), "draft");
  assert.equal(await runtime.answer("question"), "cooldown");
  assert.match(await runtime.aiTestText(), /冷卻/);
  assert.deepEqual(calls, ["agent"]);
  now += 30_000;
  assert.equal(await runtime.answer("question"), "text");
  assert.deepEqual(calls, ["agent", "generate"]);
});

test("review trims input and supplies advice-only instruction; generate uses draft capability", async () => {
  const calls: string[] = [];
  const runtime = {
    answer: async (text: string) => {
      calls.push(text);
      return text;
    },
    agentText: async (text: string) => {
      calls.push(text);
      return text;
    },
    aiTestText: async () => "unused",
  };
  const review = await runAssistantSurface("review", "  task  ", runtime);
  assert.match(review, /不要聲稱已執行或核准任何動作/);
  assert.ok(review.endsWith("task"));
  assert.equal(await runAssistantSurface("generate", "  draft  ", runtime), "draft");
});

test("receipt dispatch keeps scope and silently ignores an unrelated image result", async () => {
  const commands: unknown[] = [];
  const reply = createAssistantReply<"ignored", string>({
    receiptIntake: async (...input) => {
      commands.push(input);
      return "ignored";
    },
    activeUser: async () => {
      throw new Error("receipt owns its qualification");
    },
    answer: async () => "answer",
    miniAppUrl: () => "https://example.test",
    receiptMessage: () => null,
    attendanceMessage: () => "attendance",
    diaryMessage: () => "diary",
    textMessage: (text) => text,
    reply: async () => {
      throw new Error("no message should be sent");
    },
  });
  assert.equal(
    await reply("token", { userId: "user", scope: "group:group", imageId: "image" }),
    false,
  );
  assert.deepEqual(commands, [["user", "group:group", { type: "receive", imageId: "image" }]]);
});
