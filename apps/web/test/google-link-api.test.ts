import assert from "node:assert/strict";
import test from "node:test";
import { UserError } from "@line-work/account/domain/user";
import { createGoogleLinkRequest } from "../src/modules/account/google-link-api.server";

test("external Google handoff verifies Google without LINE and cannot confirm without LINE proof", async () => {
  const originalFetch = globalThis.fetch;
  const saved = { ...process.env };
  const calls: string[] = [];
  let staged = false;
  process.env.APP_ORIGIN = "https://app.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return Response.json({
      id: "11111111-1111-4111-8111-111111111111",
      email: "test@example.test",
      email_confirmed_at: "2026-09-12",
      identities: [{ provider: "google", id: "google-sub" }],
    });
  };
  const api = createGoogleLinkRequest(
    {
      start: async () => {
        throw new Error("unexpected");
      },
      pending: async () => {
        throw new Error("unexpected");
      },
      stage: async (token, google) => {
        assert.equal(token, "a".repeat(43));
        assert.equal(google.sub, "google-sub");
        staged = true;
      },
      confirm: async () => {
        throw new Error("unexpected");
      },
      cancel: async () => {
        throw new Error("unexpected");
      },
    },
    {
      requestIdentity: async () => {
        throw new UserError(401, "請重新登入 LINE。");
      },
      limitRequest: async () => {},
    },
  );
  const request = (action: string, origin = process.env.APP_ORIGIN!, bearer = true) =>
    new Request("https://app.example.test/api/membership/google-link", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "x-google-link": "a".repeat(43),
        ...(bearer ? { authorization: "Bearer verified-google" } : {}),
      },
      body: JSON.stringify({ action, id: "11111111-1111-4111-8111-111111111111" }),
    });
  try {
    assert.equal((await api.POST(request("stage", "https://evil.test"))).status, 403);
    assert.equal((await api.POST(request("stage", undefined, false))).status, 401);
    assert.equal((await api.POST(request("confirm"))).status, 401);
    assert.equal(staged, false);
    assert.equal((await api.POST(request("stage"))).status, 200);
    assert.equal(staged, true);
    assert.ok(
      calls.length > 0 && calls.every((url) => url.startsWith("https://auth.example.test/")),
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env = saved;
  }
});
