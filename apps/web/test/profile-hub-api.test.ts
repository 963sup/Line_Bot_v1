import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { profileActivity } from "../src/app/api/_composition/account.server";
import { publicRepositories } from "../src/app/api/_composition/repository-public.server";
import { GET as profileActivityGet } from "../src/app/api/profile/activity/route";
import { GET as publicRepositoriesGet } from "../src/app/api/repositories/public/route";
import { lineMiniApp } from "../src/shared/server/line-mini-app";

test("profile hub read transports call their authoritative owner contracts", async () => {
  const previousOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://app.example";
  const user = "U" + "8".repeat(32);

  const activityRead = mock.method(profileActivity, "read", async () => ({
    achievements: [
      {
        id: "first",
        name: "First",
        description: "First earned recognition",
        iconRef: null,
        visibility: "public" as const,
        awardedAt: 10,
        sourceKind: "system",
      },
    ],
    contributions: [{ day: "2026-09-26", count: 2 }],
  }));
  const popularRead = mock.method(publicRepositories, "popularByOwner", async () => ({
    items: [{ id: "repository-a", ownerLogin: "alice", name: "one", starCount: 3 }],
    totalCount: 1,
  }));
  const fetch = mock.method(globalThis, "fetch", async (input: unknown) => {
    const url = String(input);
    if (url.startsWith("https://api.line.me/oauth2/v2.1/verify?")) {
      return Response.json({
        client_id: lineMiniApp("developing").channelId,
        expires_in: 30,
        scope: "profile",
      });
    }
    if (url === "https://api.line.me/v2/profile") return Response.json({ userId: user });
    throw new Error("Unexpected network request");
  });

  try {
    const activityResponse = await profileActivityGet(
      new Request("https://app.example/api/profile/activity", {
        headers: { "x-line-token": "offline-profile-hub" },
      }),
    );
    assert.equal(activityResponse.status, 200);
    assert.deepEqual(await activityResponse.json(), {
      activity: {
        achievements: [
          {
            id: "first",
            name: "First",
            description: "First earned recognition",
            iconRef: null,
            visibility: "public",
            awardedAt: 10,
            sourceKind: "system",
          },
        ],
        contributions: [{ day: "2026-09-26", count: 2 }],
      },
    });

    const publicResponse = await publicRepositoriesGet(
      new Request("https://app.example/api/repositories/public?owner=alice&limit=6"),
    );
    assert.equal(publicResponse.status, 200);
    assert.deepEqual(await publicResponse.json(), {
      items: [{ id: "repository-a", ownerLogin: "alice", name: "one", starCount: 3 }],
      totalCount: 1,
    });

    assert.equal(activityRead.mock.callCount(), 1);
    assert.equal(popularRead.mock.callCount(), 1);
    assert.deepEqual(popularRead.mock.calls[0]?.arguments, ["alice", 6]);
  } finally {
    fetch.mock.restore();
    activityRead.mock.restore();
    popularRead.mock.restore();
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
  }
});

test("public Repository projection rejects ambiguous selectors", async () => {
  for (const url of [
    "https://app.example/api/repositories/public",
    "https://app.example/api/repositories/public?owner=a&owner=b",
    "https://app.example/api/repositories/public?owner=alice&limit=0",
    "https://app.example/api/repositories/public?owner=alice&private=1",
  ]) {
    const response = await publicRepositoriesGet(new Request(url));
    assert.equal(response.status, 400);
  }
});
