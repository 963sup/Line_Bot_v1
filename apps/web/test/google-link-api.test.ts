import assert from "node:assert/strict";
import test from "node:test";
import type { VerifiedGoogleIdentity } from "@line_bot_v1/account/contracts/output/identity-provider";
import { UserError } from "@line_bot_v1/account/domain/user";
import { createGoogleLinkRequest } from "../src/modules/account/google-link-api.server";

test("external Google handoff verifies Google without LINE and cannot confirm without LINE proof", async () => {
  const saved = { ...process.env };
  let staged = false;
  let verifiedToken = "";
  process.env.APP_ORIGIN = "https://app.example.test";
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
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
      verifyGoogle: async (token) => {
        verifiedToken = token;
        return {
          id: "google-user",
          sub: "google-sub",
          email: "test@example.test",
        } satisfies VerifiedGoogleIdentity;
      },
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
    assert.equal(verifiedToken, "verified-google");
  } finally {
    process.env = saved;
  }
});
