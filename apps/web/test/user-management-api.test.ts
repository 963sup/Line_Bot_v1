import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import { PostgresUserManagement } from "@line-work/account/adapters/postgres";
import { UserError } from "@line-work/account/domain/user";
import { GET, POST } from "../src/app/api/membership/manage/route";
import { lineMiniApp } from "../src/shared/server/line-mini-app";
import { activateMember, closeFixture, mockSupabase } from "./member-fixture";

test("member management HTTP verifies LINE, rejects forged origin/identity and redacts failures", async () => {
  await mockSupabase();
  const previous = process.env.POSTGRES_URL;
  process.env.POSTGRES_URL = "postgresql://synthetic:synthetic@127.0.0.1:1/synthetic";
  Object.assign(process.env, {
    LINE_PROVIDER_ID: "p",
    APP_ORIGIN: "https://app.example",
  });
  const original = globalThis.fetch,
    user = "U" + "3".repeat(32);
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
  const request = (query = "", token = "proof") =>
    new Request(`https://app.example/api/membership/manage?${query}`, {
      headers: { "x-line-token": token },
    });
  try {
    const id = await activateMember(user);
    let writes = 0;
    mock.method(PostgresUserManagement.prototype, "view", async (actor: string) => {
      assert.equal(actor, id);
      return { actorId: id, canSuspend: true, users: [], next: null, detail: null };
    });
    assert.equal((await GET(request("", ""))).status, 401);
    assert.equal((await GET(request("actor=forged"))).status, 400);
    assert.equal((await GET(request("id=a&id=b"))).status, 400);
    const response = await GET(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const command = {
      action: "suspend",
      requestId: randomUUID(),
      target: "target",
      expectedVersion: 1,
      reason: "已確認",
    };
    const post = (body: unknown = command, origin = "https://app.example", token = "proof") =>
      new Request("https://app.example/api/membership/manage", {
        method: "POST",
        headers: { origin, "x-line-token": token, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    mock.method(PostgresUserManagement.prototype, "execute", async (actor: string) => {
      assert.equal(actor, id);
      writes++;
      return {
        id: "target",
        version: 2,
        status: "suspended",
        requestId: command.requestId,
        at: 100,
      };
    });
    assert.equal((await POST(post(command, "https://evil.example"))).status, 403);
    assert.equal((await POST(post(command, "https://app.example", ""))).status, 401);
    assert.equal((await POST(post({ ...command, actor: "forged" }))).status, 400);
    assert.equal(writes, 0);
    assert.equal((await POST(post())).status, 200);
    assert.equal(writes, 1);
    mock.method(PostgresUserManagement.prototype, "view", async () => {
      throw new UserError(403, "無管理權限");
    });
    assert.equal((await GET(request())).status, 403);
    mock.method(PostgresUserManagement.prototype, "view", async () => {
      throw new Error("private failure");
    });
    const fail = await GET(request());
    assert.equal(fail.status, 503);
    assert.doesNotMatch(await fail.text(), /private failure/);
  } finally {
    globalThis.fetch = original;
    mock.restoreAll();
    if (previous === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = previous;
    await closeFixture();
  }
});
