import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import { PostgresPartnerRepository } from "@line-work/partners/adapters/postgres";
import { PartnerError } from "@line-work/partners/domain";
import { GET, POST } from "../src/app/api/partners/route";
import { lineMiniApp } from "../src/shared/server/line-mini-app";
import { activateMember, closeFixture, mockSupabase } from "./member-fixture";

test("partner management HTTP uses verified LINE User, not supplied identity or role", async () => {
  await mockSupabase();
  const previous = process.env.POSTGRES_URL;
  process.env.POSTGRES_URL = "postgresql://synthetic:synthetic@127.0.0.1:1/synthetic";
  Object.assign(process.env, {
    LINE_PROVIDER_ID: "p",
    APP_ORIGIN: "https://app.example",
  });
  const original = globalThis.fetch;
  const user = "U" + "2".repeat(32);
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
  const request = (token = "proof", query = "view=manage&userId=forged&role=admin") =>
    new Request(`https://app.example/api/partners?${query}`, {
      headers: { "x-line-token": token },
    });
  try {
    const id = await activateMember(user);
    let calls = 0;
    mock.method(
      PostgresPartnerRepository.prototype,
      "view",
      async (actor: string, view: string) => {
        calls++;
        assert.equal(actor, id);
        assert.equal(view, "manage");
        return {
          userId: id,
          partners: [],
          news: [],
          referrals: [],
          canReview: false,
          next: null,
        };
      },
    );
    assert.equal((await GET(request(""))).status, 401);
    assert.equal(calls, 0);
    const response = await GET(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).userId, id);
    assert.equal((await GET(request("proof", "view=manage&after=bad"))).status, 400);
    mock.method(PostgresPartnerRepository.prototype, "view", async () => {
      throw new PartnerError(403, "需要合作夥伴管理權限。");
    });
    assert.equal((await GET(request())).status, 403);
    mock.method(PostgresPartnerRepository.prototype, "view", async () => {
      throw new Error("private database failure");
    });
    const failed = await GET(request());
    assert.equal(failed.status, 503);
    assert.ok(!(await failed.text()).includes("private database"));
    const command = {
      action: "save-partner",
      requestId: randomUUID(),
      id: randomUUID(),
      expectedVersion: 0,
      name: "測試",
      category: "設備",
      region: "",
      status: "published",
      consentConfirmed: true,
      reason: "已核實",
      contacts: [
        {
          id: randomUUID(),
          name: "窗口",
          responsibility: "聯絡",
          phone: "0212345678",
          email: "",
          line: "",
          status: "published",
        },
      ],
    };
    let writes = 0;
    mock.method(PostgresPartnerRepository.prototype, "execute", async (actor: string) => {
      assert.equal(actor, id);
      writes++;
      return { id: command.id };
    });
    const post = (body: unknown = command, origin = "https://app.example", token = "proof") =>
      new Request("https://app.example/api/partners", {
        method: "POST",
        headers: { origin, "content-type": "application/json", "x-line-token": token },
        body: JSON.stringify(body),
      });
    assert.equal((await POST(post(command, "https://evil.example"))).status, 403);
    assert.equal((await POST(post(command, "https://app.example", ""))).status, 401);
    assert.equal((await POST(post({ ...command, userId: "forged" }))).status, 400);
    assert.equal((await POST(post({ ...command, consentConfirmed: false }))).status, 400);
    assert.equal(writes, 0);
    assert.equal((await POST(post())).status, 200);
    assert.equal(writes, 1);
  } finally {
    if (previous === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = previous;
    globalThis.fetch = original;
    mock.restoreAll();
    await closeFixture();
  }
});
