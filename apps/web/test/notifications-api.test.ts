import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { notifications } from "../src/app/api/_composition/notifications.server";
import { GET, POST } from "../src/app/api/notifications/route";
import { lineMiniApp } from "../src/shared/server/line-mini-app";

test("notification HTTP verifies LINE, bounds JSON and does not leak failures", async () => {
  const previousOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://app.example";
  const user = `U${"1".repeat(32)}`;
  const read = mock.method(notifications, "read", async () => ({ items: [] }));
  const markRead = mock.method(notifications, "markRead", async () => {
    throw new Error("secret database details");
  });
  const fetch = mock.method(globalThis, "fetch", async (input: unknown) => {
    const url = String(input);
    if (url.startsWith("https://api.line.me/oauth2/v2.1/verify?")) {
      return Response.json({
        client_id: lineMiniApp("developing").channelId,
        expires_in: 30,
        scope: "profile",
      });
    }
    if (url === "https://api.line.me/v2/profile") return Response.json({ userId: user });
    throw new Error("Unexpected network request");
  });
  const request = (body?: string, origin = "https://app.example", auth = true) =>
    new Request("https://app.example/api/notifications", {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(auth ? { "x-line-token": "offline-notification" } : {}),
      },
      body,
    });
  try {
    assert.equal((await GET(request(undefined, "", false))).status, 401);
    assert.equal((await POST(request("{}", "https://evil.example"))).status, 403);
    assert.equal((await POST(request("{"))).status, 400);
    assert.equal((await POST(request("x".repeat(4097)))).status, 413);
    assert.equal((await GET(request())).status, 200);
    const failed = await POST(request('{"id":"11111111-1111-4111-8111-111111111111"}'));
    assert.equal(failed.status, 503);
    assert.equal((await failed.text()).includes("secret"), false);
  } finally {
    fetch.mock.restore();
    read.mock.restore();
    markRead.mock.restore();
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
  }
});
