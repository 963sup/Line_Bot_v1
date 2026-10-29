import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAssistantWebhookRouter,
  type SelectedWebhookEvent,
  type WebhookIdempotencyStore,
} from "../src/application/webhook-router.js";

const event: SelectedWebhookEvent = { id: "event", token: "reply", userId: "actor", ai: false };

function fixture() {
  const calls: string[] = [];
  const store: WebhookIdempotencyStore = {
    claim: async (scope, id) => {
      calls.push(`claim:${scope}:${id}`);
      return { state: "claimed", token: "lease" };
    },
    complete: async (scope, id, token, status) => {
      calls.push(`complete:${scope}:${id}:${token}:${status}`);
      return true;
    },
  };
  const config: Parameters<typeof createAssistantWebhookRouter>[0] = {
    idempotency: () => store,
    authorize: async () => true,
    reply: async (token) => {
      calls.push(`reply:${token}`);
    },
    observeError: (_error, context) => {
      calls.push(`error:${context.operation}:${context.status}`);
    },
    report: (outcome) => {
      calls.push(`report:${outcome}`);
    },
  };
  return { calls, store, config };
}

test("completed or pending claims never authorize or dispatch again", async () => {
  for (const claim of [{ state: "completed", status: 502 }, { state: "pending" }] as const) {
    const { config, calls, store } = fixture();
    store.claim = async () => claim;
    config.authorize = () => {
      throw new Error("must not run");
    };
    const dispatch = createAssistantWebhookRouter(config);
    assert.equal(await dispatch([event], "scope"), claim.state === "completed" ? 502 : 503);
    assert.deepEqual(calls, []);
  }
});

test("reply failures complete the exact lease with 502; uncertain completion returns 503", async () => {
  const { config, calls, store } = fixture();
  config.reply = async () => {
    throw new Error("provider unavailable");
  };
  assert.equal(await createAssistantWebhookRouter(config)([event], "scope"), 502);
  assert.deepEqual(calls, [
    "claim:scope:event",
    "error:reply:502",
    "report:reply_failed",
    "complete:scope:event:lease:502",
  ]);
  store.complete = async () => false;
  assert.equal(await createAssistantWebhookRouter(config)([event], "scope"), 503);
});

test("unauthorized and unavailable image input remains silent without dispatch", async () => {
  for (const authorize of [
    () => false,
    () => {
      throw new Error("source unavailable");
    },
  ]) {
    const { config, calls } = fixture();
    config.authorize = authorize;
    config.replyMembership =
      config.replyUnavailable =
      config.replyAssistant =
        async () => {
          throw new Error("image must remain silent");
        };
    const image = { ...event, assistant: { scope: "private", userId: "actor", imageId: "image" } };
    assert.equal(await createAssistantWebhookRouter(config)([image], "scope"), 200);
    assert.ok(calls.includes("report:handled_silently"));
    assert.ok(calls.includes("complete:scope:event:lease:200"));
    assert.ok(!calls.includes("report:reply_failed"));
  }
});

test("attendance navigation takes precedence and is silent; failure retains retry outcome", async () => {
  const { config, calls } = fixture();
  config.attendanceMenu = async (id) => {
    calls.push(`menu:${id}`);
  };
  config.replyAgent = async () => {
    throw new Error("must not run");
  };
  assert.equal(
    await createAssistantWebhookRouter(config)(
      [{ ...event, attendanceMenu: true, agentInput: "draft" }],
      "scope",
    ),
    200,
  );
  assert.ok(calls.includes("menu:actor"));
  assert.ok(calls.includes("report:handled_silently"));
});

test("dispatch deadline distinguishes AI interactions and leaves claimed work to complete", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const [selected, deadline] of [
    [event, 10_000],
    [{ ...event, agentInput: "draft" }, 20_000],
  ] as const) {
    const { config } = fixture();
    config.reply = config.replyAgent = () => new Promise(() => {});
    const response = createAssistantWebhookRouter(config)([selected], "scope");
    t.mock.timers.tick(deadline);
    assert.equal(await response, 503);
  }
});
