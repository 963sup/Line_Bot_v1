import assert from "node:assert/strict";
import { test } from "node:test";
import { pushLineText } from "../src/adapters/messaging/push-message.js";

const subject = `U${"1".repeat(32)}`,
  key = "11111111-1111-4111-8111-111111111111";
test("push retry keeps exact recipient, payload and key; only accepted 409 is success", async () => {
  const calls: RequestInit[] = [];
  const outcomes = [
    new Response(null, { status: 500 }),
    new Response(null, { status: 409, headers: { "x-line-accepted-request-id": "accepted" } }),
    new Response(null, { status: 409 }),
    new Response(null, { status: 400 }),
    new Response(null, { status: 429 }),
  ];
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.line.me/v2/bot/message/push");
    calls.push(init!);
    return outcomes.shift()!;
  };
  assert.equal(await pushLineText("token", subject, "上班已記錄", key, fetcher), "retry");
  assert.equal(await pushLineText("token", subject, "上班已記錄", key, fetcher), "accepted");
  assert.equal(calls[0]!.body, calls[1]!.body);
  assert.equal(new Headers(calls[0]!.headers).get("X-Line-Retry-Key"), key);
  assert.equal(JSON.parse(String(calls[0]!.body)).to, subject);
  for (const result of ["failed", "failed", "retry"])
    assert.equal(await pushLineText("token", subject, "上班已記錄", key, fetcher), result);
});
