import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { profileStatuses } from "../src/app/api/_composition/account-status.server";
import { GET, POST } from "../src/app/api/profile/status/route";
import { lineSessionHeaders } from "./line-session-fixture";

test("profile status HTTP surface verifies the service session and preserves mutation identity", async () => {
  const previousOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://app.example";
  const lineUser = `U${"9".repeat(32)}`;
  const status = {
    userId: "user-a",
    message: "Heads down",
    emoji: "🎯",
    limitedAvailability: true,
    expiresAt: null,
    version: 1,
    createdAt: 10,
    updatedAt: 10,
  };
  const read = mock.method(profileStatuses, "get", async () => status);
  const change = mock.method(profileStatuses, "change", async () => ({
    ...status,
    requestId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  }));
  const fetch = mock.method(globalThis, "fetch", async (input: unknown) => {
    const url = String(input);
    if (url.startsWith("https://api.line.me/oauth2/v2.1/verify?")) {
      return Response.json({
        client_id: lineMiniApp("developing").channelId,
        expires_in: 30,
        scope: "profile",
      });
    }
    if (url === "https://api.line.me/v2/profile") return Response.json({ userId: lineUser });
    throw new Error("Unexpected network request");
  });
  try {
    const authenticated = await lineSessionHeaders("profile-status");
    const request = (body?: unknown, origin = "https://app.example") =>
      new Request("https://app.example/api/profile/status", {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...authenticated,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    assert.deepEqual(await (await GET(request())).json(), { status });
    const command = {
      requestId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      message: "Heads down",
      emoji: "🎯",
      limitedAvailability: true,
      expiresAt: null,
      expectedVersion: 0,
    };
    assert.deepEqual(await (await POST(request(command))).json(), {
      status: { ...status, requestId: command.requestId },
    });
    assert.equal((await POST(request(command, "https://evil.example"))).status, 403);
    assert.equal(read.mock.callCount(), 1);
    assert.equal(change.mock.callCount(), 1);
  } finally {
    read.mock.restore();
    change.mock.restore();
    fetch.mock.restore();
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
  }
});
