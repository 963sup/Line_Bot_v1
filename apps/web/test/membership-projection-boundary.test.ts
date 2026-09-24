import assert from "node:assert/strict";
import { test } from "node:test";
import { createUserRequest } from "../src/modules/account/api.server";

const account = {
  id: "user-1",
  status: "active",
  createdAt: 1,
  googleEmail: null,
};

const claim = {
  day: "2026-09-24",
  prizeCode: "coin-one",
  reward: 1,
  policyVersion: "wheel-v1",
  decidedAt: 1,
};

function dependencies() {
  return {
    requestIdentity: async () => "verified-subject",
    getUser: async () => account,
    coinView: async () => {
      throw new Error("daily-check-in projection unavailable");
    },
    activeLineUser: async () => account,
    pauseUser: async () => account,
    updateLogin: async () => account,
    readClaim: async () => null,
    checkIn: async () => ({ claim, credited: 1, replayed: false }),
  } as any;
}

test("membership Account read survives DailyCheckIn projection failure", async () => {
  const { GET } = createUserRequest(dependencies());
  const response = await GET(new Request("https://app.example/api/membership"));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    member: {
      ...account,
      coins: { unavailable: true },
    },
  });
});

test("successful check-in is not converted to unknown result by projection failure", async (t) => {
  const previousOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://app.example";
  t.after(() => {
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
  });

  const { POST } = createUserRequest(dependencies());
  const response = await POST(
    new Request("https://app.example/api/membership", {
      method: "POST",
      headers: {
        Origin: "https://app.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "checkIn", expectedDay: "2026-09-24" }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    member: {
      ...account,
      coins: { unavailable: true },
    },
    checkIn: {
      claim,
      credited: 1,
      replayed: false,
      coins: { unavailable: true },
    },
  });
});
