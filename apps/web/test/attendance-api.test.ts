import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import { POST as clockIn } from "../src/app/api/attendance/clock-in/route";
import { POST as clockOut } from "../src/app/api/attendance/clock-out/route";
import { GET } from "../src/app/api/attendance/route";
import { lineMiniApp } from "../src/shared/server/line-mini-app";
import {
  activateMember,
  allowAttendance,
  closeFixture,
  memberStore,
  mockSupabase,
} from "./member-fixture";

test("attendance APIs verify proof, geofence and cross-day records; private Bot receipts retry without duplicate clocks", async () => {
  await mockSupabase();
  const previousBotToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  Object.assign(process.env, {
    APP_ORIGIN: "https://app.example",
    LINE_PROVIDER_ID: "p",
    LINE_CHANNEL_ACCESS_TOKEN: "synthetic-bot-token",
  });
  const user = `U${"1".repeat(32)}`,
    other = `U${"2".repeat(32)}`;
  let now = Date.parse("2026-09-07T06:30:00+08:00");
  const clock = mock.method(Date, "now", () => now),
    original = globalThis.fetch;
  const pushes: {
    key: string | null;
    body: { to: string; messages: { type: string; text: string }[] };
  }[] = [];
  let pushUnavailable = false;
  globalThis.fetch = (async (input, init) => {
    if (String(input) === "https://api.line.me/v2/bot/message/push") {
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer synthetic-bot-token");
      pushes.push({
        key: new Headers(init?.headers).get("x-line-retry-key"),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({}, { status: pushUnavailable ? 503 : 200 });
    }
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
    throw Error("Unexpected outbound request");
  }) as typeof fetch;
  const body = (expectedVersion: number, extra = {}) => ({
    requestId: randomUUID(),
    expectedVersion,
    location: { latitude: 25, longitude: 121, accuracy: 5 },
    ...extra,
  });
  const request = (
    value?: unknown,
    token = "token",
    origin = "https://app.example",
    compact = false,
  ) =>
    new Request("https://app.example/api/attendance" + (compact ? "?view=clock" : ""), {
      method: value === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        ...(value === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { "X-Line-Token": token } : {}),
      },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });
  try {
    for (const action of [clockIn, clockOut]) {
      assert.equal((await action(request(body(0), ""))).status, 401);
      assert.equal((await action(request(body(0), "token", "https://evil.example"))).status, 403);
      assert.equal((await action(request({ action: "clockIn" }))).status, 400);
    }
    assert.equal((await GET(request(undefined, ""))).status, 401);
    const member = await activateMember(user);
    await allowAttendance(member);
    await activateMember(other);
    const prepared = await (
      await GET(request(undefined, "token", "https://app.example", true))
    ).json();
    assert.equal(prepared.memberId, member);
    assert.equal(prepared.working, false);
    assert.equal(prepared.version, 0);
    assert.equal(prepared.attendance, undefined, "clock preparation does not download history");
    assert.equal(pushes.length, 0);
    for (const extra of [
      { reason: "old" },
      { acceptRegularTransition: true },
      { memberId: "forged" },
      { now: now },
    ]) {
      assert.equal((await clockIn(request(body(0, extra)))).status, 400);
    }
    assert.equal(pushes.length, 0, "rejected clock attempts must not notify");
    const startBody = body(0),
      start = await clockIn(request(startBody));
    assert.equal(start.status, 200);
    const first = await start.json();
    assert.equal(first.attendance.active.startedAt, now);
    assert.equal(first.version, 1);
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0]!.body.to, user, "notify only the verified clocking user's private chat");
    assert.equal(pushes[0]!.body.messages[0]!.type, "text");
    assert.match(pushes[0]!.body.messages[0]!.text, /^上班已記錄\n2026\/09\/07\s06:30/);
    assert.match(pushes[0]!.key!, /^[0-9a-f-]{36}$/);
    now = Date.parse("2026-09-07T17:00:00+08:00");
    const view = await (await GET(request())).json();
    assert.equal(view.version, 1);
    assert.equal(view.attendance.records.length, 1);
    assert.equal((await clockIn(request(body(0)))).status, 409);
    assert.equal(
      (await clockOut(request(body(1, { location: { latitude: 0, longitude: 0, accuracy: 5 } }))))
        .status,
      422,
    );
    now = Date.parse("2026-09-08T01:00:00+08:00");
    assert.equal(
      pushes.length,
      1,
      "reads, version conflicts and invalid locations must not create receipts",
    );
    pushUnavailable = true;
    const endBody = body(1);
    const end = await clockOut(request(endBody));
    assert.equal(end.status, 200);
    const ended = await end.json();
    assert.equal(ended.attendance.active, null);
    assert.equal(ended.attendance.records[0].summary.elapsedMs, 18.5 * 3600000);
    assert.equal(pushes.length, 2, "Bot failure must not roll back a successful clock-out");
    assert.equal(pushes[1]!.body.to, user);
    assert.match(pushes[1]!.body.messages[0]!.text, /^下班已記錄\n/);
    assert.match(pushes[1]!.body.messages[0]!.text, /下班：2026\/09\/08\s01:00/);
    pushUnavailable = false;
    now += 3000;
    assert.equal((await GET(request())).status, 200);
    assert.equal(
      pushes.length,
      2,
      "reading attendance must not await or deliver pending LINE notifications",
    );
    const retriedEnd = await (await clockOut(request(endBody))).json();
    assert.equal(retriedEnd.replayed, true);
    assert.equal(retriedEnd.version, 2);
    assert.equal(retriedEnd.attendance.records.length, 1);
    assert.equal(pushes.length, 3);
    assert.deepEqual(
      pushes[2],
      pushes[1],
      "retry uses identical recipient, content and LINE retry key",
    );
    await clockOut(request(endBody));
    assert.equal(pushes.length, 3, "accepted Bot receipts are not sent again");
    const replay = await (await clockIn(request(startBody))).json();
    assert.equal(replay.replayed, true);
    assert.equal(replay.credited, 0);
    const compactReplay = await (
      await clockIn(request(startBody, "token", "https://app.example", true))
    ).json();
    assert.deepEqual(compactReplay, {
      version: 1,
      at: first.attendance.active.startedAt,
      credited: 0,
      replayed: true,
    });
    const compactEnd = await (
      await clockOut(request(endBody, "token", "https://app.example", true))
    ).json();
    assert.deepEqual(compactEnd, {
      version: 2,
      at: ended.attendance.records[0].endedAt,
      credited: 0,
      replayed: true,
    });
    assert.equal(pushes.length, 3, "replaying clock-in cannot create another notification");
    const otherView = await (await GET(request(undefined, "other"))).json();
    assert.equal(otherView.attendance.records.length, 0);
    await memberStore().suspend(member);
    for (const action of [clockIn, clockOut])
      assert.equal((await action(request(body(2)))).status, 403);
    assert.equal((await GET(request())).status, 403);
    assert.equal((await GET(request(undefined, "token", "https://app.example", true))).status, 403);
  } finally {
    clock.mock.restore();
    globalThis.fetch = original;
    if (previousBotToken === undefined) delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    else process.env.LINE_CHANNEL_ACCESS_TOKEN = previousBotToken;
    await closeFixture();
  }
});
