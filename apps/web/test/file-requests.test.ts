import assert from "node:assert/strict";
import test from "node:test";
import { createFileRequests } from "../src/modules/file/file-requests";
import { StaleRequest } from "../src/modules/file/files-projection";

function client(onDenied: (message: string) => void = () => {}) {
  const epoch = { current: 0 };
  return {
    epoch,
    requests: createFileRequests({
      ownerLogin: "owner",
      repositoryName: "files",
      epoch,
      session: async () => "offline-session",
      onDenied,
    }),
  };
}

test("File and intake requests bind one session and Repository scope, including binary downloads", async (t) => {
  const { requests } = client();
  const calls: { url: URL; init: RequestInit }[] = [];
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    const url = new URL(input, "https://app.example");
    calls.push({ url, init });
    assert.equal(url.searchParams.get("owner"), "owner");
    assert.equal(url.searchParams.get("name"), "files");
    assert.equal(new Headers(init.headers).get("X-App-Session-Generation"), "offline-session");
    return url.searchParams.get("view") === "download"
      ? new Response("original")
      : Response.json({ ok: true });
  });
  await requests.file({ owner: "other", name: "other" });
  const download = await requests.file({ view: "download" });
  assert.ok(download instanceof Blob);
  assert.equal(await download.text(), "original");
  await requests.document({ operation: "intake" }, { requestId: "request" });
  assert.equal(calls[0]?.url.pathname, "/api/repository-files");
  assert.equal(calls[2]?.url.pathname, "/api/repository-document-intake");
  assert.equal(calls[2]?.init.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[2]?.init.body)), { requestId: "request" });
});

test("a stale denial after response parsing cannot clear a newer session", async (t) => {
  let denied = 0;
  const { requests, epoch } = client(() => denied++);
  const started = Promise.withResolvers<void>();
  const body = Promise.withResolvers<unknown>();
  const response = Response.json({}, { status: 403 });
  t.mock.method(response, "json", () => {
    started.resolve();
    return body.promise;
  });
  t.mock.method(globalThis, "fetch", async () => response);
  const request = requests.document({ operation: "read" });
  await started.promise;
  epoch.current++;
  body.resolve({ error: "revoked" });
  await assert.rejects(request, StaleRequest);
  assert.equal(denied, 0);
});

test("malformed authorization responses still clear protected state for both endpoints", async (t) => {
  let denied = 0;
  const { requests } = client(() => denied++);
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("not JSON", {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
  );
  await assert.rejects(requests.file(), StaleRequest);
  await assert.rejects(requests.document({ operation: "read" }), StaleRequest);
  assert.equal(denied, 2);
});

test("unknown-result and non-JSON timeout responses preserve intake recovery messages", async (t) => {
  const { requests } = client();
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ code: "UNKNOWN_RESULT" }, { status: 503 }),
  );
  await assert.rejects(
    requests.document({ operation: "intake" }),
    (error: unknown) =>
      error instanceof Error &&
      Reflect.get(error, "code") === "UNKNOWN_RESULT" &&
      error.message.includes("不會重新解析"),
  );
  t.mock.method(globalThis, "fetch", async () => new Response("gateway timeout", { status: 504 }));
  await assert.rejects(
    requests.document({ operation: "intake" }),
    /採購單請求逾時.*保存結果待確認/,
  );
});

test("a session resolved after invalidation never dispatches a request", async (t) => {
  const epoch = { current: 0 };
  const session = Promise.withResolvers<string>();
  const requests = createFileRequests({
    ownerLogin: "owner",
    repositoryName: "files",
    epoch,
    session: () => session.promise,
    onDenied() {
      assert.fail("Stale identity must not clear current data");
    },
  });
  t.mock.method(globalThis, "fetch", () => assert.fail("Stale identity must not dispatch"));
  const request = requests.file();
  epoch.current++;
  session.resolve("old-session");
  await assert.rejects(request, StaleRequest);
});

test("document failures display bounded stage, code and correlation without losing recovery guidance", async (t) => {
  const { requests } = client();
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      {
        error: "採購單保存失敗，保存結果待確認。",
        code: "CONTRACT_SAVE_FAILED",
        stage: "target.submit",
        traceId: "11111111-1111-4111-8111-111111111111",
      },
      { status: 500 },
    ),
  );
  await assert.rejects(requests.document({ operation: "intake" }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /保存結果待確認/);
    assert.match(error.message, /CONTRACT_SAVE_FAILED/);
    assert.match(error.message, /target.submit/);
    assert.match(error.message, /11111111-1111-4111-8111-111111111111/);
    return true;
  });
});
