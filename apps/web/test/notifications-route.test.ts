import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compileFunction } from "node:vm";
import { UserError } from "@line_bot_v1/account/domain/user";
import { createNotifications } from "@line_bot_v1/notifications/application/use-cases/notifications";
import type { NotificationDto } from "@line_bot_v1/notifications/contracts/dto/notification";
import type { NotificationQuery } from "@line_bot_v1/notifications/contracts/repositories/notification-repository";
import ts from "typescript";
import {
  BodyTooLargeError,
  jsonResponse,
  readBodyText,
} from "../src/shared/server/http.js";
import { RequestIdentityError } from "../src/shared/server/request-identity-error.js";

const id = "11111111-1111-4111-8111-111111111111";
const item: NotificationDto = {
  id,
  recipient: "user-1",
  sourceType: "issue",
  sourceId: "issue-1",
  sourceVersion: "3",
  kind: "issue",
  title: "Issue updated",
  body: "A referenced issue changed.",
  createdAt: 1,
  readAt: null,
  version: 1,
};

type Dependencies = Parameters<typeof createNotifications>[0];
type Route = {
  GET(request: Request): Promise<Response>;
  POST(request: Request): Promise<Response>;
  runtime: string;
  dynamic: string;
};
type RepositoryCall =
  | ["read", string, NotificationQuery]
  | ["mark", string, string, number];

function isRoute(value: unknown): value is Route {
  if (value === null || typeof value !== "object") return false;
  return (
    "GET" in value &&
    typeof value.GET === "function" &&
    "POST" in value &&
    typeof value.POST === "function" &&
    "runtime" in value &&
    typeof value.runtime === "string" &&
    "dynamic" in value &&
    typeof value.dynamic === "string"
  );
}

// Execute the actual route source, replacing only its host composition imports.
// No production factory/export or single-route server wrapper exists for testing.
function loadRoute(
  options: {
    origin?: string;
    identity?: () => Promise<string>;
    activeUser?: Dependencies["activeUser"];
    repository?: ReturnType<Dependencies["repository"]>;
  } = {},
) {
  const calls: RepositoryCall[] = [];
  const notifications = createNotifications({
    activeUser: options.activeUser ?? (async () => ({ id: "user-1" })),
    repository: () =>
      options.repository ?? {
        async read(recipient, query) {
          calls.push(["read", recipient, query]);
          return { items: [item] };
        },
        async markRead(recipient, notificationId, now) {
          calls.push(["mark", recipient, notificationId, now]);
          return { ...item, readAt: now, version: 2 };
        },
      },
    now: () => 10,
  });

  const modules = new Map<string, unknown>();
  modules.set("@line_bot_v1/account/domain/user", { UserError });
  modules.set("../../../shared/observability/server-error", {
    captureHandledServerError: () => undefined,
  });
  modules.set("../../../shared/server/http", {
    BodyTooLargeError,
    jsonResponse,
    readBodyText,
  });
  modules.set("../../../shared/server/request-identity-error", { RequestIdentityError });
  modules.set("../_composition/notifications.server", { notifications });
  modules.set("../_composition/request-identity.server", {
    requestLineIdentity: options.identity ?? (async () => "verified-subject"),
  });

  const source = readFileSync(
    new URL("../src/app/api/notifications/route.ts", import.meta.url),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const loadedModule: { exports: unknown } = { exports: {} };
  compileFunction(outputText, ["require", "module", "exports", "process"])(
    (name: string) => {
      if (!modules.has(name)) throw new Error(`Unexpected route dependency: ${name}`);
      return modules.get(name);
    },
    loadedModule,
    loadedModule.exports,
    { env: { APP_ORIGIN: options.origin ?? "https://example.test" } },
  );
  if (!isRoute(loadedModule.exports)) throw new Error("Route exports are incomplete.");
  return { route: loadedModule.exports, calls };
}

function post(body: string, overrides?: Headers) {
  const headers = new Headers({
    origin: "https://example.test",
    "content-type": "application/json",
  });
  overrides?.forEach((value, key) => headers.set(key, value));
  return new Request("https://example.test/api/notifications", {
    method: "POST",
    headers,
    body,
  });
}

test("actual route preserves GET/POST wire contracts and published framework exports", async () => {
  const { route, calls } = loadRoute();
  assert.deepEqual(Object.keys(route).sort(), ["GET", "POST", "dynamic", "runtime"]);
  assert.equal(route.runtime, "nodejs");
  assert.equal(route.dynamic, "force-dynamic");
  const read = await route.GET(
    new Request(`https://example.test/api/notifications?id=${id}&unread=1`),
  );
  assert.equal(read.status, 200);
  assert.equal(read.headers.get("cache-control"), "no-store");
  assert.deepEqual(await read.json(), { items: [item] });
  const marked = await route.POST(post(JSON.stringify({ id, recipient: "forged-user" })));
  assert.equal(marked.status, 200);
  assert.deepEqual(await marked.json(), { notification: { ...item, readAt: 10, version: 2 } });
  assert.deepEqual(calls, [
    ["read", "user-1", { id, unreadOnly: true }],
    ["mark", "user-1", id, 10],
  ]);
});

test("authentication precedes malformed input, origin and body consumption", async () => {
  const { route, calls } = loadRoute({
    origin: "",
    identity: async () => {
      throw new RequestIdentityError(401, "請先登入。");
    },
  });
  const request = post("{invalid");
  const response = await route.POST(request);
  assert.equal(response.status, 401);
  assert.equal(request.bodyUsed, false);
  assert.deepEqual(await response.json(), { error: "請先登入。" });
  const read = await route.GET(new Request("https://example.test/api/notifications?id=invalid"));
  assert.equal(read.status, 401);
  assert.deepEqual(calls, []);
});

test("transport rejects origin, type, malformed input and oversized bodies before mutation", async () => {
  const cases = [
    { origin: "", request: post(JSON.stringify({ id })), status: 503 },
    { origin: "https://example.test/path", request: post(JSON.stringify({ id })), status: 503 },
    {
      request: post(
        JSON.stringify({ id }),
        new Headers({ origin: "https://other.test" }),
      ),
      status: 403,
    },
    {
      request: post(
        JSON.stringify({ id }),
        new Headers({ "content-type": "text/plain" }),
      ),
      status: 415,
    },
    { request: post("{"), status: 400 },
    { request: post("[]"), status: 400 },
    { request: post("null"), status: 400 },
    { request: post('{"id":123}'), status: 400 },
    { request: post("x".repeat(4097)), status: 413 },
  ];
  for (const example of cases) {
    const { route, calls } = loadRoute({ origin: example.origin });
    assert.equal((await route.POST(example.request)).status, example.status);
    assert.deepEqual(calls, []);
  }
});

test("business Result is translated to existing 400 and 404 HTTP failures", async () => {
  const { route } = loadRoute({
    repository: { read: async () => ({ items: [] }), markRead: async () => null },
  });
  const invalid = await route.POST(post('{"id":"invalid"}'));
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "通知識別碼不正確。" });
  const absent = await route.POST(post(JSON.stringify({ id })));
  assert.equal(absent.status, 404);
  assert.deepEqual(await absent.json(), { error: "通知不存在或不可閱讀。" });
  assert.equal(
    (await route.GET(new Request(`https://example.test/api/notifications?id=${id}`))).status,
    404,
  );
  const empty = await route.GET(new Request("https://example.test/api/notifications"));
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { items: [] });
});

test("qualification failure remains forbidden without resolving persistence", async () => {
  const { route, calls } = loadRoute({
    activeUser: async () => {
      throw new UserError(403, "使用者已停權。");
    },
  });
  const response = await route.POST(post(JSON.stringify({ id })));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "使用者已停權。" });
  assert.deepEqual(calls, []);
});

test("unexpected storage failure is unavailable, not an empty inbox or leaked detail", async () => {
  const fail = async () => {
    throw new Error("private database detail");
  };
  const { route } = loadRoute({ repository: { read: fail, markRead: fail } });
  const responses = [
    await route.GET(new Request("https://example.test/api/notifications")),
    await route.POST(post(JSON.stringify({ id }))),
  ];
  for (const response of responses) {
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "通知服務暫不可用，請稍後重試。" });
  }
});
