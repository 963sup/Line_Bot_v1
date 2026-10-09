import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import {
  POST as auth,
  DELETE as logout,
  PATCH as renew,
  GET as restore,
} from "../src/app/api/auth/route";
import { GET as expense } from "../src/app/api/expenses/[id]/route";
import { GET as membership } from "../src/app/api/membership/route";
import { closeFixture, expenseStore, mockSupabase } from "./member-fixture";

test("the auth endpoint rejects a wrong-channel proof; protected APIs never reverify LINE", async () => {
  const previous = {
    fetch: globalThis.fetch,
    origin: process.env.APP_ORIGIN,
    kvUrl: process.env.KV_REST_API_URL,
    kvToken: process.env.KV_REST_API_TOKEN,
  };
  process.env.APP_ORIGIN = "https://example.test";
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ client_id: "wrong-channel", expires_in: 60, scope: "profile" });
  };
  const authRequest = new Request("https://example.test/api/auth", {
    method: "POST",
    headers: { origin: "https://example.test", "content-type": "application/json" },
    body: JSON.stringify({ accessToken: "synthetic-token" }),
  });
  const protectedRequest = new Request("https://example.test/api/membership");
  try {
    const wrongOrigin = await auth(
      new Request("https://example.test/api/auth", {
        method: "POST",
        headers: { origin: "https://attacker.test", "content-type": "application/json" },
        body: JSON.stringify({ accessToken: "synthetic-token" }),
      }),
    );
    assert.equal(wrongOrigin.status, 403);
    assert.equal(calls, 0, "the server rejects a cross-origin exchange before LINE verification");
    const wrongOriginRestore = await restore(
      new Request("https://example.test/api/auth", {
        headers: { origin: "https://attacker.test" },
      }),
    );
    assert.equal(wrongOriginRestore.status, 403);
    assert.equal(
      calls,
      0,
      "the read-only restore endpoint still rejects an explicit foreign origin",
    );
    assert.equal(
      (
        await renew(
          new Request("https://example.test/api/auth", {
            method: "PATCH",
            headers: { origin: "https://attacker.test" },
          }),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await logout(
          new Request("https://example.test/api/auth", {
            method: "DELETE",
            headers: { origin: "https://attacker.test" },
          }),
        )
      ).status,
      403,
    );
    assert.equal(calls, 0, "renew and logout reject a cross-origin request before session access");
    const invalid = await auth(authRequest);
    assert.equal(invalid.status, 401);
    assert.deepEqual(await invalid.json(), { error: "LINE 登入已失效，請重新開啟。" });
    assert.equal((await membership(protectedRequest)).status, 401);
    const result = await expense(protectedRequest, {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }),
    });
    assert.equal(result.status, 401);
    assert.equal(calls, 1, "ordinary protected requests must not call LINE");
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.origin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous.origin;
    if (previous.kvUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = previous.kvUrl;
    if (previous.kvToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = previous.kvToken;
  }
});

test("LINE provider outages remain retryable 503 failures at session exchange", async () => {
  const previous = {
    fetch: globalThis.fetch,
    origin: process.env.APP_ORIGIN,
    kvUrl: process.env.KV_REST_API_URL,
    kvToken: process.env.KV_REST_API_TOKEN,
  };
  process.env.APP_ORIGIN = "https://example.test";
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  globalThis.fetch = async () => new Response(null, { status: 503 });
  try {
    const response = await auth(
      new Request("https://example.test/api/auth", {
        method: "POST",
        headers: { origin: "https://example.test", "content-type": "application/json" },
        body: JSON.stringify({ accessToken: "synthetic-token" }),
      }),
    );
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "LINE 身分驗證服務暫不可用，請稍後重試。" });
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.origin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous.origin;
    if (previous.kvUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = previous.kvUrl;
    if (previous.kvToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = previous.kvToken;
  }
});

test("app sessions authenticate protected APIs without another LINE verification", async () => {
  await mockSupabase();
  const previous = {
    fetch: globalThis.fetch,
    provider: process.env.LINE_PROVIDER_ID,
    origin: process.env.APP_ORIGIN,
    kvUrl: process.env.KV_REST_API_URL,
    kvToken: process.env.KV_REST_API_TOKEN,
  };
  process.env.LINE_PROVIDER_ID = "test-provider";
  process.env.APP_ORIGIN = "https://example.test";
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  let proofCalls = 0;
  globalThis.fetch = (async (input, init) => {
    proofCalls++;
    const url = String(input);
    if (url.startsWith("https://api.line.me/oauth2/v2.1/verify?"))
      return Response.json({
        client_id: lineMiniApp("developing").channelId,
        expires_in: 60,
        scope: "profile",
      });
    if (url === "https://api.line.me/v2/profile") {
      const subject =
        new Headers(init?.headers).get("authorization") === "Bearer other-token"
          ? `U${"4".repeat(32)}`
          : `U${"3".repeat(32)}`;
      return Response.json({ userId: subject });
    }
    throw Error("Unexpected outbound request");
  }) as typeof fetch;
  mock.method(expenseStore(), "get", async () => {
    assert.fail("rejected requests must not read an expense");
  });
  const validId = "00000000-0000-4000-8000-000000000000";
  const context = { params: Promise.resolve({ id: validId }) };
  const request = (headers: HeadersInit = {}) =>
    new Request(`https://example.test/api/expenses/${validId}`, { headers });
  try {
    const missing = await expense(request(), context);
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { error: "服務登入已失效，請重新登入。" });
    assert.equal(proofCalls, 0);
    const missingSession = await restore(new Request("https://example.test/api/auth"));
    assert.equal(missingSession.status, 401);
    assert.equal(proofCalls, 0, "a missing cookie never invokes LINE verification");

    const exchanged = await auth(
      new Request("https://example.test/api/auth", {
        method: "POST",
        headers: { Origin: "https://example.test", "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: "synthetic-token" }),
      }),
    );
    assert.equal(exchanged.status, 200);
    const exchangedBody = (await exchanged.json()) as {
      generation?: unknown;
      sessionChanged?: unknown;
    };
    assert.deepEqual(Object.keys(exchangedBody).sort(), ["generation", "sessionChanged"]);
    assert.equal(exchangedBody.sessionChanged, true);
    assert.match(
      String(exchangedBody.generation),
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.equal(JSON.stringify(exchangedBody).includes("synthetic-token"), false);
    const sessionCookie = exchanged.headers.get("set-cookie") ?? "";
    assert.match(sessionCookie, /^__Host-line_bot_v1_session=[A-Za-z0-9_-]{43};/);
    assert.match(sessionCookie, /HttpOnly/);
    assert.match(sessionCookie, /Secure/);
    assert.match(sessionCookie, /SameSite=Lax/);
    const session = {
      Cookie: sessionCookie.split(";", 1)[0]!,
      "X-App-Session-Generation": String(exchangedBody.generation),
    };
    assert.equal(proofCalls, 2, "session exchange verifies the token and fetches its subject");

    const restored = await restore(
      new Request("https://example.test/api/auth", { headers: { Cookie: session.Cookie } }),
    );
    assert.equal(restored.status, 200);
    assert.deepEqual(await restored.json(), { generation: session["X-App-Session-Generation"] });
    assert.equal(restored.headers.get("cache-control"), "no-store");
    assert.equal(proofCalls, 2, "cookie restoration returns the generation without calling LINE");

    const sameSubjectExchange = await auth(
      new Request("https://example.test/api/auth", {
        method: "POST",
        headers: {
          Cookie: session.Cookie,
          Origin: "https://example.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accessToken: "synthetic-token" }),
      }),
    );
    assert.equal(sameSubjectExchange.status, 200);
    assert.deepEqual(await sameSubjectExchange.json(), {
      generation: session["X-App-Session-Generation"],
      sessionChanged: false,
    });
    assert.equal(sameSubjectExchange.headers.get("set-cookie")?.split(";", 1)[0], session.Cookie);
    assert.equal(proofCalls, 4, "same-account exchange keeps the current app session generation");

    const inactive = await expense(request(session), context);
    assert.equal(inactive.status, 403);
    assert.deepEqual(await inactive.json(), { error: "請先完成使用者註冊或恢復使用者資格。" });
    assert.equal(proofCalls, 4, "protected API requests reuse the app session");

    const malformed = await expense(
      new Request("https://example.test/api/expenses/not-a-uuid", { headers: session }),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    assert.equal(malformed.status, 404);
    assert.deepEqual(await malformed.json(), { error: "資料不存在。" });
    assert.equal(proofCalls, 4);

    const renewed = await renew(
      new Request("https://example.test/api/auth", {
        method: "PATCH",
        headers: {
          ...session,
          Origin: "https://example.test",
        },
      }),
    );
    assert.equal(renewed.status, 200);
    assert.deepEqual(await renewed.json(), {
      generation: new Headers(session).get("X-App-Session-Generation"),
    });
    assert.match(renewed.headers.get("set-cookie") ?? "", /Max-Age=604800/);
    assert.equal(proofCalls, 4, "session renewal does not send the LINE token to LINE");

    const switched = await auth(
      new Request("https://example.test/api/auth", {
        method: "POST",
        headers: {
          Cookie: new Headers(session).get("Cookie") ?? "",
          Origin: "https://example.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accessToken: "other-token" }),
      }),
    );
    assert.equal(switched.status, 200);
    const switchedBody = (await switched.json()) as {
      generation?: string;
      sessionChanged?: boolean;
    };
    assert.equal(switchedBody.sessionChanged, true);
    assert.equal(typeof switchedBody.generation, "string");
    assert.match(
      switchedBody.generation!,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.notEqual(switchedBody.generation, new Headers(session).get("X-App-Session-Generation"));
    const switchedCookie = switched.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(switchedCookie);
    const switchedSession = {
      Cookie: switchedCookie,
      "X-App-Session-Generation": switchedBody.generation!,
    };
    assert.equal((await expense(request(session), context)).status, 401);
    assert.equal(proofCalls, 6, "account switching verifies the new proof once");

    const logoutHeaders = new Headers(switchedSession);
    logoutHeaders.delete("X-App-Session-Generation");
    logoutHeaders.set("Origin", "https://example.test");
    const signedOut = await logout(
      new Request("https://example.test/api/auth", { method: "DELETE", headers: logoutHeaders }),
    );
    assert.equal(signedOut.status, 204);
    assert.match(signedOut.headers.get("set-cookie") ?? "", /Max-Age=0/);
    assert.equal((await expense(request(switchedSession), context)).status, 401);
    assert.equal(proofCalls, 6, "logout and later protected requests do not reverify LINE");
    assert.equal(
      (
        await restore(
          new Request("https://example.test/api/auth", {
            headers: { Cookie: switchedSession.Cookie },
          }),
        )
      ).status,
      401,
      "a revoked cookie cannot restore a service session",
    );
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.provider === undefined) delete process.env.LINE_PROVIDER_ID;
    else process.env.LINE_PROVIDER_ID = previous.provider;
    if (previous.origin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous.origin;
    if (previous.kvUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = previous.kvUrl;
    if (previous.kvToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = previous.kvToken;
    mock.restoreAll();
    await closeFixture();
  }
});
