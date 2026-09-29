import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mock, test } from "node:test";
import type { createPostgresAttendanceStore } from "@line_bot_v1/attendance/composition/bootstrap/postgres-attendance-store";
import { showAttendanceMenu } from "../src/app/api/_composition/attendance.server";
import { GET, POST } from "../src/app/api/internal/attendance-maintenance/route";
import { closeFixture, mockSupabase } from "./member-fixture";

test("maintenance rejects absent configuration and wrong bearer before opening a database", async () => {
  const previous = process.env.ATTENDANCE_WORKER_SECRET;
  try {
    delete process.env.ATTENDANCE_WORKER_SECRET;
    const request = (authorization = "") =>
      new Request("https://app.example/api/internal/attendance-maintenance", {
        method: "POST",
        headers: { authorization },
      });
    assert.equal((await POST(request())).status, 503);
    assert.equal((await GET(request())).status, 503);
    process.env.ATTENDANCE_WORKER_SECRET = "test-only-worker-secret-32-characters";
    const rejected = await POST(request("Bearer wrong"));
    assert.equal(rejected.status, 401);
    const preflightRejected = await GET(request("Bearer wrong"));
    assert.equal(preflightRejected.status, 401);
    const preflight = await GET(request("Bearer test-only-worker-secret-32-characters"));
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get("cache-control") ?? "", /no-store/);
    assert.match(rejected.headers.get("cache-control") ?? "", /no-store/);
  } finally {
    if (previous === undefined) delete process.env.ATTENDANCE_WORKER_SECRET;
    else process.env.ATTENDANCE_WORKER_SECRET = previous;
  }
});

test("attendance worker redacts provider failures and preserves queued-work recovery", () => {
  const worker = new URL(
    "../src/app/api/_composition/attendance-worker.server.ts",
    import.meta.url,
  );
  const provider = `export async function attendanceMaintenance() {
    throw new Error("sentinel-private-connection-token");
  }`;
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { registerHooks } from "node:module";
       registerHooks({ resolve(specifier, context, next) {
         if (specifier === "./attendance.server" && context.parentURL === ${JSON.stringify(worker.href)})
           return { url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(provider)}`)}, shortCircuit: true };
         return next(specifier, context);
       }});
       await import(${JSON.stringify(worker.href)});`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(), "Attendance maintenance failed; queued work is retained.");
});

test("private menu navigation refreshes authoritative state, delivers only menus, and reads back each target", async () => {
  await mockSupabase();
  type AttendancePersistence = ReturnType<typeof createPostgresAttendanceStore>;
  const store = (globalThis as typeof globalThis & { attendanceStore?: AttendancePersistence })
    .attendanceStore;
  assert.ok(store);
  const previous = {
    fetch: globalThis.fetch,
    token: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  };
  const subject = `U${"a".repeat(32)}`;
  Object.assign(process.env, {
    LINE_CHANNEL_ACCESS_TOKEN: "test-token",
  });
  const lineCalls: Array<{ method: string; path: string }> = [];
  let linkedId = "richmenu-f0"; // The member starts on a submenu.
  let missingAlias = false;
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    lineCalls.push({ method, path: url.pathname });
    if (url.pathname.startsWith("/v2/bot/richmenu/alias/")) {
      if (missingAlias) return new Response(null, { status: 404 });
      return Response.json({
        richMenuId: url.pathname.endsWith("attendance-out") ? "richmenu-b2" : "richmenu-a1",
      });
    }
    if (method === "POST") {
      linkedId = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
      return new Response(null, { status: 200 });
    }
    if (!linkedId) return new Response(null, { status: 404 });
    return Response.json({ richMenuId: linkedId });
  }) as typeof fetch;
  const states = ["ready", "working", "working", "ready"] as const;
  let refreshes = 0;
  let claims = 0;
  const completed: boolean[] = [];
  let failRefresh = false;
  mock.method(store, "refreshMenu", async (provider, actor) => {
    assert.equal(provider, "line:primary");
    assert.equal(actor, subject);
    refreshes++;
    if (failRefresh) throw Error("authoritative refresh failed");
  });
  mock.method(store, "snapshot", async () => {
    assert.fail("menu navigation must not read an attendance snapshot");
  });
  mock.method(store, "claimMenu", async (_now, provider, actor) => {
    assert.equal(provider, "line:primary");
    assert.equal(actor, subject);
    const state = states[claims++];
    return { uid: "member", subject, state, revision: claims, token: `lease-${claims}` };
  });
  mock.method(store, "completeMenu", async (_job, success) => {
    completed.push(success);
    return success;
  });
  mock.method(store, "claimNotification", async () => {
    assert.fail("menu navigation must not claim notifications");
  });
  try {
    await showAttendanceMenu(subject);
    await showAttendanceMenu(subject);
    await showAttendanceMenu(subject);
    assert.equal(refreshes, 3);
    assert.equal(claims, 3);
    assert.deepEqual(completed, [true, true, true]);
    assert.deepEqual(lineCalls, [
      { method: "GET", path: `/v2/bot/user/${subject}/richmenu` },
      { method: "GET", path: "/v2/bot/richmenu/alias/line_bot_v1-attendance-in" },
      { method: "POST", path: `/v2/bot/user/${subject}/richmenu/richmenu-a1` },
      { method: "GET", path: `/v2/bot/user/${subject}/richmenu` },
      { method: "GET", path: `/v2/bot/user/${subject}/richmenu` },
      { method: "GET", path: "/v2/bot/richmenu/alias/line_bot_v1-attendance-out" },
      { method: "POST", path: `/v2/bot/user/${subject}/richmenu/richmenu-b2` },
      { method: "GET", path: `/v2/bot/user/${subject}/richmenu` },
      { method: "GET", path: `/v2/bot/user/${subject}/richmenu` },
      { method: "GET", path: "/v2/bot/richmenu/alias/line_bot_v1-attendance-out" },
    ]);
    missingAlias = true;
    await assert.rejects(showAttendanceMenu(subject), /attendance_menu_sync_pending/);
    assert.equal(lineCalls.length, 12, "a missing alias must not link a menu");
    assert.deepEqual(completed, [true, true, true, false]);
    failRefresh = true;
    await assert.rejects(showAttendanceMenu(subject), /authoritative refresh failed/);
    assert.equal(lineCalls.length, 12, "a failed refresh must not link a menu");
    assert.equal(claims, 4);
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.token === undefined) delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    else process.env.LINE_CHANNEL_ACCESS_TOKEN = previous.token;
    mock.restoreAll();
    await closeFixture();
  }
});
