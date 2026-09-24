import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import { UserError } from "@line-work/account/domain/user";
import { PostgresWorkplaceStore } from "@line-work/attendance/adapters/postgres";
import { GET, POST } from "../src/app/api/workplaces/route";
import { lineMiniApp } from "../src/shared/server/line-mini-app";
import { activateMember, closeFixture, mockSupabase } from "./member-fixture";

test("workplace HTTP preserves verified actor, rejects forged requests and supports bounded Unicode forms", async () => {
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
    new Request("https://app.example/api/workplaces", {
      method: body ? "POST" : "GET",
      headers: { "x-line-token": token, origin, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    const id = await activateMember(user);
    let calls = 0;
    mock.method(PostgresWorkplaceStore.prototype, "read", async (actor: string) => {
      assert.equal(actor, id);
      return { canCreate: true, sites: [], members: [], next: null };
    });
    mock.method(
      PostgresWorkplaceStore.prototype,
      "change",
      async (actor: string, c: { id: string }) => {
        assert.equal(actor, id);
        calls++;
        return { id: c.id, version: 1 };
      },
    );
    assert.equal((await GET(request(undefined, ""))).status, 401);
    const page = await GET(request());
    assert.equal(page.status, 200);
    assert.equal((await page.json()).memberId, id);
    const command = {
      action: "save",
      id: randomUUID(),
      requestId: randomUUID(),
      expectedVersion: 0,
      name: "地".repeat(100),
      description: "址".repeat(500),
      latitude: 25,
      longitude: 121,
      radius: 100,
      enabled: true,
    };
    assert.equal((await POST(request(command, "proof", "https://evil.example"))).status, 403);
    assert.equal((await POST(request({ ...command, role: "admin" }))).status, 400);
    assert.equal((await POST(request({ ...command, description: "x".repeat(5000) }))).status, 413);
    assert.equal(calls, 0);
    assert.equal((await POST(request(command))).status, 200);
    assert.equal(calls, 1);
    mock.method(PostgresWorkplaceStore.prototype, "read", async () => {
      throw new UserError(403, "沒有工作地點管理權限。");
    });
    assert.equal((await GET(request())).status, 403);
  } finally {
    if (previousDatabase === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = previousDatabase;
    globalThis.fetch = original;
    mock.restoreAll();
    await closeFixture();
  }
});
