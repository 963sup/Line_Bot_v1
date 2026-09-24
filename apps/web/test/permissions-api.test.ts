import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import { PostgresPermissionStore } from "@line-work/identity-access/adapters/postgres";
import { PermissionError } from "@line-work/identity-access/domain/permission";
import { GET, POST } from "../src/app/api/permissions/route";
import { lineMiniApp } from "../src/shared/server/line-mini-app";
import { activateMember, closeFixture, mockSupabase } from "./member-fixture";

test("permission HTTP uses verified actor and rejects forgery, missing proof, cross-origin and oversized requests", async () => {
  await mockSupabase();
  const previousDatabase = process.env.POSTGRES_URL;
  process.env.POSTGRES_URL = "postgresql://synthetic:synthetic@127.0.0.1:1/synthetic";
  Object.assign(process.env, {
    APP_ORIGIN: "https://app.example",
    LINE_PROVIDER_ID: "p",
  });
  const original = globalThis.fetch,
    user = "U" + "1".repeat(32);
  globalThis.fetch = (async (input) => {
    if (String(input).startsWith("https://api.line.me/oauth2/v2.1/verify?"))
      return Response.json({
        client_id: lineMiniApp("developing").channelId,
        expires_in: 60,
        scope: "profile",
      });
    if (String(input) === "https://api.line.me/v2/profile") return Response.json({ userId: user });
    throw Error("Unexpected outbound request");
  }) as typeof fetch;
  const request = (body?: unknown, token = "proof", origin = "https://app.example") =>
    new Request("https://app.example/api/permissions", {
      method: body ? "POST" : "GET",
      headers: { "x-line-token": token, origin, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    const id = await activateMember(user);
    let calls = 0;
    mock.method(PostgresPermissionStore.prototype, "read", async (actor: string) => {
      assert.equal(actor, id);
      return {
        memberId: actor,
        canManage: true,
        own: [],
        target: null,
        history: [],
        moreHistory: false,
      };
    });
    mock.method(
      PostgresPermissionStore.prototype,
      "change",
      async (actor: string, c: { requestId: string }) => {
        assert.equal(actor, id);
        calls++;
        return { requestId: c.requestId, version: 1 };
      },
    );
    assert.equal((await GET(request(undefined, ""))).status, 401);
    const page = await GET(request());
    assert.equal(page.status, 200);
    assert.equal((await page.json()).memberId, id);
    const command = {
      requestId: randomUUID(),
      target: "target",
      permission: "workplaces.manage",
      workplaceId: null,
      enabled: true,
      expectedVersion: 0,
      reason: "授權",
    };
    assert.equal((await POST(request(command, "proof", "https://evil.example"))).status, 403);
    assert.equal((await POST(request({ ...command, role: "admin" }))).status, 400);
    assert.equal((await POST(request({ ...command, reason: "x".repeat(5000) }))).status, 413);
    assert.equal(calls, 0);
    assert.equal((await POST(request(command))).status, 200);
    assert.equal(calls, 1);
    mock.method(PostgresPermissionStore.prototype, "read", async () => {
      throw new PermissionError(403, "沒有工作地點管理權限。");
    });
    const denied = await GET(request());
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), {
      error: "沒有工作地點管理權限。",
      code: "membership_denied",
      retryable: false,
    });
  } finally {
    if (previousDatabase === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = previousDatabase;
    globalThis.fetch = original;
    mock.restoreAll();
    await closeFixture();
  }
});
