import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { notifications } from "../src/app/api/_composition/notifications.server";
import { GET, POST } from "../src/app/api/notifications/route";
import { lineMiniApp } from "@line_bot_v1/line-channel/mini-app";

test("notification HTTP verifies LINE, bounds JSON and does not leak failures", async () => {
  const previousOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://app.example";
  const user = `U${"1".repeat(32)}`;
  const read = mock.method(
    notifications,
    "read",
    async (): ReturnType<typeof notifications.read> => ({ ok: true, value: { items: [] } }),
  );
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
    assert.equal(read.mock.callCount(), 0);
    assert.equal(markRead.mock.callCount(), 0);
    const inbox = await GET(request());
    assert.equal(inbox.status, 200);
    assert.equal(inbox.headers.get("cache-control"), "no-store");
    assert.deepEqual(await inbox.json(), { items: [] });
    assert.equal(read.mock.callCount(), 1);
    assert.deepEqual(read.mock.calls[0].arguments, [user, { id: undefined, unreadOnly: false }]);
    const id = "11111111-1111-4111-8111-111111111111";
    const failed = await POST(request(JSON.stringify({ id, recipient: "forged-user" })));
    assert.equal(failed.status, 503);
    assert.equal((await failed.text()).includes("secret"), false);
    assert.equal(markRead.mock.callCount(), 1);
    assert.deepEqual(markRead.mock.calls[0].arguments, [user, { id }]);
  } finally {
    fetch.mock.restore();
    read.mock.restore();
    markRead.mock.restore();
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
  }
});
