import assert from "node:assert/strict";
import { test } from "node:test";
import { createBrowserSupabaseClient } from "../src/browser-auth.ts";
import { uploadSupabaseFile } from "../src/browser-upload.ts";

const revision = "revision-1";
const signed = `https://project.supabase.co/storage/v1/object/upload/sign/repository-files/folder/${revision}?token=synthetic`;

test("signed upload rejects invalid destinations before sending bytes", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response();
  });
  for (const url of [
    signed.replace("project.supabase.co", "attacker.test"),
    signed.replace("https:", "http:"),
    signed.replace("repository-files", "other-bucket"),
    signed.replace(revision, "wrong-revision"),
    signed.replace("?token=synthetic", ""),
    `${signed}#fragment`,
    signed.replace("https://", "https://user:password@"),
    signed.replace("project.supabase.co", "127.0.0.1").replace("https:", "http:"),
  ])
    await assert.rejects(uploadSupabaseFile(url, revision, new File(["data"], "file.txt")));
  assert.equal(calls, 0);
});

test("signed upload preserves immutable PUT protocol and treats a lost response as unknown", async (t) => {
  let captured;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    captured = { url, options };
    throw new Error("response lost after storage write");
  });
  await uploadSupabaseFile(signed, revision, new File(["data"], "file.txt"));
  assert.equal(captured.url, signed);
  assert.equal(captured.options.method, "PUT");
  assert.deepEqual(captured.options.headers, { "x-upsert": "false" });
  assert.equal(captured.options.cache, "no-store");
  assert.equal(captured.options.body.get("cacheControl"), "0");
  assert.equal(await captured.options.body.get("").text(), "data");
});

test("loopback tickets are usable only from a loopback browser document", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "location");
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "location", previous);
    else delete globalThis.location;
  });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { hostname: "localhost" },
  });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response();
  });
  const local = signed.replace("https://project.supabase.co", "http://127.0.0.1:54321");
  await uploadSupabaseFile(local, revision, new File(["data"], "file.txt"));
  assert.equal(calls, 1);
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { hostname: "app.example.test" },
  });
  await assert.rejects(uploadSupabaseFile(local, revision, new File(["data"], "file.txt")));
  assert.equal(calls, 1);
});

test("browser auth keeps PKCE but does not persist upstream provider credentials", async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const client = createBrowserSupabaseClient(
    "https://project.supabase.co",
    "synthetic-publishable-key",
    storage,
  );
  await client.auth.initialize();
  try {
    const providerStorage = client.auth.storage;
    await providerStorage.setItem(
      "session",
      JSON.stringify({
        access_token: "app-token",
        provider_token: "private",
        provider_refresh_token: "private-refresh",
      }),
    );
    assert.deepEqual(JSON.parse(values.get("session")), { access_token: "app-token" });
    await providerStorage.setItem("pkce", "plain-verifier");
    assert.equal(await providerStorage.getItem("pkce"), "plain-verifier");
    await providerStorage.removeItem("pkce");
    assert.equal(values.has("pkce"), false);
    assert.equal(client.auth.flowType, "pkce");
    assert.equal(client.auth.detectSessionInUrl, false);
    assert.equal(client.auth.autoRefreshToken, true);
  } finally {
    await client.auth.stopAutoRefresh();
  }
});
