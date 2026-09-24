import assert from "node:assert/strict";
import { test } from "node:test";
import { assistantRequest } from "../src/modules/assistant/api.server";
import { assistantSurfaceConfig, isAssistantSurfaceMode } from "../src/modules/assistant/web-surface";

function withOrigin(value: string | undefined, run: () => Promise<void>) {
  const previous = process.env.APP_ORIGIN;
  if (value === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = value;
  return run().finally(() => {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  });
}

test("assistant surface exposes the three bounded Web modes", () => {
  assert.equal(isAssistantSurfaceMode("ask"), true);
  assert.equal(isAssistantSurfaceMode("generate"), true);
  assert.equal(isAssistantSurfaceMode("review"), true);
  assert.equal(isAssistantSurfaceMode("execute"), false);
  assert.equal(assistantSurfaceConfig.review.maxLength, 360);
});

test("assistant transport requires trusted origin and passes verified subject to runner", async () => {
  await withOrigin("https://mini.example", async () => {
    let observed:
      | { subject: string; mode: "ask" | "generate" | "review"; input: string }
      | undefined;
    const response = await assistantRequest(
      new Request("https://mini.example/api/assistant", {
        method: "POST",
        headers: {
          origin: "https://mini.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ mode: "review", input: "  draft text  " }),
      }),
      async (subject, mode, input) => {
        observed = { subject, mode, input };
        return "reviewed";
      },
      async () => "line-user-1",
    );

    assert.equal(response.status, 200);
    assert.deepEqual(observed, {
      subject: "line-user-1",
      mode: "review",
      input: "draft text",
    });
    assert.deepEqual(await response.json(), { text: "reviewed" });
  });
});

test("assistant transport rejects unsupported mode before invoking runner", async () => {
  await withOrigin("https://mini.example", async () => {
    let invoked = false;
    const response = await assistantRequest(
      new Request("https://mini.example/api/assistant", {
        method: "POST",
        headers: {
          origin: "https://mini.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ mode: "execute", input: "do it" }),
      }),
      async () => {
        invoked = true;
        return "unexpected";
      },
      async () => "line-user-1",
    );

    assert.equal(response.status, 400);
    assert.equal(invoked, false);
  });
});

test("assistant transport rejects a foreign origin", async () => {
  await withOrigin("https://mini.example", async () => {
    const response = await assistantRequest(
      new Request("https://mini.example/api/assistant", {
        method: "POST",
        headers: {
          origin: "https://foreign.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ mode: "ask", input: "hello" }),
      }),
      async () => "unexpected",
      async () => "line-user-1",
    );

    assert.equal(response.status, 403);
  });
});
