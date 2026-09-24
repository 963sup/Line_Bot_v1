import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import { supabaseIdentity } from "@line-work/account/adapters/supabase-identity";
import { COIN_ASSET_CODE } from "@line-work/asset/domain";
import { POST as clockInPost } from "../src/app/api/attendance/clock-in/route";
import { POST as clockOutPost } from "../src/app/api/attendance/clock-out/route";
import { GET as attendanceGet } from "../src/app/api/attendance/route";
import { POST as REGISTER } from "../src/app/api/membership/register/route";
import { POST as RESTORE } from "../src/app/api/membership/restore/route";
import { GET, POST } from "../src/app/api/membership/route";
import { lineMiniApp } from "../src/shared/server/line-mini-app";
import {
  activateMember,
  allowAttendance,
  closeFixture,
  memberStore,
  mockSupabase,
  walletStore,
} from "./member-fixture";

test("LINE-only membership preserves ownership and rewards; retired direct Google binding is rejected", async () => {
  await mockSupabase();
  Object.assign(process.env, {
    LINE_PROVIDER_ID: "p",
    APP_ORIGIN: "https://app.example",
  });
  const user = `U${"1".repeat(32)}`,
    other = `U${"2".repeat(32)}`,
    original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (input, init) => {
    calls++;
    if (String(input).startsWith("https://api.line.me/oauth2/v2.1/verify?"))
      return Response.json({
        client_id: lineMiniApp("developing").channelId,
        expires_in: 60,
        scope: "profile",
      });
    if (String(input) === "https://api.line.me/v2/profile")
      return Response.json({
        userId: new Headers(init?.headers).get("authorization") === "Bearer other" ? other : user,
      });
    throw new Error("Unexpected outbound request");
  }) as typeof fetch;
  const request = (
    body?: unknown,
    token = "token",
    origin = "https://app.example",
    google?: string,
  ) =>
    new Request("https://app.example/api/membership", {
      method: body ? "POST" : "GET",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(token ? { "X-Line-Token": token } : {}),
        ...(google ? { Authorization: `Bearer ${google}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    assert.equal((await GET(request(undefined, ""))).status, 401);
    assert.equal(calls, 0);
    assert.equal(
      (await REGISTER(request({ login: "alice" }, "token", "https://evil.test"))).status,
      403,
    );
    assert.equal(calls, 0);
    assert.equal((await POST(request({ action: "checkIn" }))).status, 403);
    assert.equal((await (await GET(request())).json()).member, null);
    const registrations = await Promise.all(
      Array.from({ length: 5 }, () => REGISTER(request({ login: "alice" }))),
    );
    assert.ok(registrations.every((r) => r.status === 200));
    const registered = await Promise.all(registrations.map((r) => r.json()));
    const id = registered[0].member.id;
    await allowAttendance(id);
    assert.ok(registered.every((r) => r.member.id === id));
    assert.equal((await memberStore().get(id)).auth_user_id, null);
    assert.equal(registered[0].member.googleEmail, null);
    assert.equal((await POST(request({ action: "registerLine" }))).status, 400);
    const otherId = await activateMember(other);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        POST(request({ action: "checkIn", amount: 1000, memberId: otherId, day: "2099-01-01" })),
      ),
    );
    assert.ok(results.every((r) => r.status === 200));
    const data = await Promise.all(results.map((r) => r.json()));
    assert.equal(
      data.reduce((n, r) => n + r.checkIn.credited, 0),
      1,
    );
    assert.equal((await walletStore().balance(otherId, COIN_ASSET_CODE)).balance, 0);
    const point = { latitude: 25, longitude: 121, accuracy: 5 };
    const time = mock.method(Date, "now", () => Date.parse("2026-09-07T00:00:00Z"));
    assert.equal((await POST(request({ action: "clockIn", location: point }))).status, 400);
    const before = await (await attendanceGet(request())).json();
    const start = await clockInPost(
      request({ requestId: randomUUID(), expectedVersion: before.version, location: point }),
    );
    assert.equal(start.status, 200);
    const working = await start.json();
    assert.equal(working.credited, 0.5);
    time.mock.mockImplementation(() => Date.parse("2026-09-07T09:00:00Z"));
    const end = await clockOutPost(
      request({ requestId: randomUUID(), expectedVersion: working.version, location: point }),
    );
    assert.equal(end.status, 200);
    assert.equal((await end.json()).credited, 0.5);
    time.mock.restore();
    assert.equal((await POST(request({ action: "confirmGoogle" }))).status, 400);
    const failed = mock.method(supabaseIdentity(), "verify", async () => {
      throw new Error("private secret payload");
    });
    assert.equal(
      (await GET(request())).status,
      200,
      "Google outage does not block LINE membership",
    );
    failed.mock.restore();
    assert.equal((await POST(request({ action: "deactivate" }))).status, 200);
    assert.equal((await POST(request({ action: "checkIn" }))).status, 403);
    assert.equal((await walletStore().balance(id, COIN_ASSET_CODE)).balance, 2);
    assert.equal((await REGISTER(request({ login: "alice" }))).status, 409);
    assert.equal((await RESTORE(request({}))).status, 200);
    assert.equal((await memberStore().get(id)).id, id);
    await memberStore().suspend(id);
    assert.equal((await attendanceGet(request())).status, 403);
    assert.equal(
      (await clockInPost(request({ requestId: randomUUID(), expectedVersion: 0, location: point })))
        .status,
      403,
    );
    assert.equal(
      (
        await clockOutPost(
          request({ requestId: randomUUID(), expectedVersion: 0, location: point }),
        )
      ).status,
      403,
    );
    assert.equal((await REGISTER(request({ login: "alice" }))).status, 403);
    assert.equal(
      (await POST(request({ action: "confirmGoogle" }, "token", "https://app.example", "token")))
        .status,
      403,
    );
    assert.equal((await POST(request({ action: "checkIn" }))).status, 403);
  } finally {
    globalThis.fetch = original;
    await closeFixture();
  }
});
