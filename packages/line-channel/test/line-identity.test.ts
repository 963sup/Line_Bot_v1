import assert from "node:assert/strict";
import test from "node:test";
import {
  LineIdentityError,
  LineIdentityUnavailableError,
  verifyLiffUser,
} from "../src/adapters/identity/verify-user.js";

const subject = `U${"1".repeat(32)}`;
const valid = { client_id: "channel", expires_in: 60, scope: "profile openid" };

test("LINE identity rejects invalid channel, expiry and scope before trusting a subject", async () => {
  for (const proof of [
    { ...valid, client_id: "other" },
    { ...valid, expires_in: 0 },
    { ...valid, scope: "openid" },
  ]) {
    let calls = 0;
    const request: typeof fetch = async () => {
      calls++;
      return Response.json(proof);
    };
    await assert.rejects(verifyLiffUser("token", "channel", request), LineIdentityError);
    assert.equal(calls, 1, "a rejected proof must not fetch profile");
  }
});

test("LINE identity treats malformed provider profile as unavailable", async () => {
  let calls = 0;
  await assert.rejects(
    verifyLiffUser("token", "channel", async () =>
      Response.json(++calls === 1 ? valid : { userId: "forged" }),
    ),
    LineIdentityUnavailableError,
  );
});

test("LINE identity verifies token then profile with no cache, redirects or credential errors", async () => {
  const urls: string[] = [];
  const request: typeof fetch = async (url, options) => {
    urls.push(String(url));
    assert.equal(options?.redirect, "error");
    assert.equal(options?.cache, "no-store");
    assert.ok(options?.signal);
    if (urls.length === 1) return Response.json(valid);
    assert.equal(new Headers(options?.headers).get("authorization"), "Bearer token");
    return Response.json({ userId: subject });
  };
  assert.equal(await verifyLiffUser("token", "channel", request), subject);
  assert.deepEqual(urls, [
    "https://api.line.me/oauth2/v2.1/verify?access_token=token",
    "https://api.line.me/v2/profile",
  ]);
  await assert.rejects(
    verifyLiffUser("token", "channel", async () => {
      throw new Error("private token");
    }),
    (error: unknown) =>
      error instanceof LineIdentityUnavailableError &&
      error.status === 503 &&
      !error.message.includes("private token"),
  );
  for (const status of [429, 500, 503]) {
    await assert.rejects(
      verifyLiffUser("token", "channel", async () => new Response(null, { status })),
      LineIdentityUnavailableError,
    );
  }
  await assert.rejects(
    verifyLiffUser("token", "channel", async () => new Response(null, { status: 401 })),
    LineIdentityError,
  );
  for (const [token, channel] of [
    ["", "channel"],
    ["x".repeat(4097), "channel"],
    ["token", ""],
  ]) {
    await assert.rejects(
      verifyLiffUser(token!, channel!, async () => {
        throw new Error("must not fetch");
      }),
      LineIdentityError,
    );
  }
});
