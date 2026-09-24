import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { PostgresExpenseStore } from "@line-work/expense/adapters/postgres";
import { GET as expense } from "../src/app/api/expenses/[id]/route";
import { GET as membership } from "../src/app/api/membership/route";
import { lineMiniApp } from "../src/shared/server/line-mini-app";
import { closeFixture, mockSupabase } from "./member-fixture";

test("technology identity failures retain the membership and expense HTTP 401 contracts", async () => {
  const previous = {
    fetch: globalThis.fetch,
    kvUrl: process.env.KV_REST_API_URL,
    kvToken: process.env.KV_REST_API_TOKEN,
  };
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ client_id: "wrong-channel", expires_in: 60, scope: "profile" });
  };
  const request = new Request("https://example.test/api/membership", {
    headers: { "x-line-token": "synthetic-token" },
  });
  try {
    const member = await membership(request);
    assert.equal(member.status, 401);
    assert.deepEqual(await member.json(), {
      error: "LINE 登入已失效，請重新開啟。",
      code: "session_expired",
      retryable: false,
    });
    const result = await expense(request, {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }),
    });
    assert.equal(result.status, 401);
    assert.deepEqual(await result.json(), { error: "LINE 登入已失效，請重新開啟。" });
    assert.equal(calls, 2, "invalid proofs must not reach profile or database operations");
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.kvUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = previous.kvUrl;
    if (previous.kvToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = previous.kvToken;
  }
});

test("LINE provider outages remain retryable 503 failures instead of authentication failures", async () => {
  const previous = {
    fetch: globalThis.fetch,
    kvUrl: process.env.KV_REST_API_URL,
    kvToken: process.env.KV_REST_API_TOKEN,
  };
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  globalThis.fetch = async () => new Response(null, { status: 503 });
  const request = new Request("https://example.test/api/membership", {
    headers: { "x-line-token": "synthetic-token" },
  });
  try {
    const response = await membership(request);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "LINE 身分驗證服務暫不可用，請稍後重試。",
      code: "service_unavailable",
      retryable: true,
    });
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.kvUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = previous.kvUrl;
    if (previous.kvToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = previous.kvToken;
  }
});

test("expense rejects missing proof, inactive membership and malformed IDs before business reads", async () => {
  await mockSupabase();
  const previous = {
    fetch: globalThis.fetch,
    provider: process.env.LINE_PROVIDER_ID,
    kvUrl: process.env.KV_REST_API_URL,
    kvToken: process.env.KV_REST_API_TOKEN,
  };
  process.env.LINE_PROVIDER_ID = "test-provider";
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  let proofCalls = 0;
  globalThis.fetch = (async (input) => {
    proofCalls++;
    const url = String(input);
    if (url.startsWith("https://api.line.me/oauth2/v2.1/verify?"))
      return Response.json({
        client_id: lineMiniApp("developing").channelId,
        expires_in: 60,
        scope: "profile",
      });
    if (url === "https://api.line.me/v2/profile")
      return Response.json({ userId: `U${"3".repeat(32)}` });
    throw Error("Unexpected outbound request");
  }) as typeof fetch;
  mock.method(PostgresExpenseStore.prototype, "get", async () => {
    assert.fail("rejected requests must not read an expense");
  });
  const request = (id: string, proof = true) =>
    [
      new Request(`https://example.test/api/expenses/${id}`, {
        headers: proof ? { "x-line-token": "synthetic-token" } : {},
      }),
      { params: Promise.resolve({ id }) },
    ] as const;
  const validId = "00000000-0000-4000-8000-000000000000";
  try {
    const missingProof = await expense(...request(validId, false));
    assert.equal(missingProof.status, 401);
    assert.deepEqual(await missingProof.json(), { error: "請重新登入 LINE。" });
    assert.equal(proofCalls, 0);
    const inactive = await expense(...request(validId));
    assert.equal(inactive.status, 403);
    assert.deepEqual(await inactive.json(), { error: "請先完成使用者註冊或恢復使用者資格。" });
    assert.equal(proofCalls, 2);
    const malformed = await expense(...request("not-a-uuid"));
    assert.equal(malformed.status, 404);
    assert.deepEqual(await malformed.json(), { error: "資料不存在。" });
    assert.equal(proofCalls, 4);
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.provider === undefined) delete process.env.LINE_PROVIDER_ID;
    else process.env.LINE_PROVIDER_ID = previous.provider;
    if (previous.kvUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = previous.kvUrl;
    if (previous.kvToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = previous.kvToken;
    mock.restoreAll();
    await closeFixture();
  }
});
