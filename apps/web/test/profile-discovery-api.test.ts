import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { achievements, follows, profiles } from "../src/app/api/_composition/account.server";
import { repositoryCollection } from "../src/app/api/_composition/repository-collection.server";
import { repositoryDiscovery } from "../src/app/api/_composition/repository-discovery.server";
import { repositoryStars } from "../src/app/api/_composition/repository-stars.server";
import { GET as followsGet, POST as followsPost } from "../src/app/api/follows/route";
import { GET as achievementsGet } from "../src/app/api/profile/achievements/route";
import { GET as profileGet, POST as profilePost } from "../src/app/api/profile/route";
import { GET as exploreGet, POST as explorePost } from "../src/app/api/repositories/explore/route";
import { GET as repositoriesGet } from "../src/app/api/repositories/route";
import { GET as starredGet } from "../src/app/api/repositories/starred/route";
import { lineMiniApp } from "../src/shared/server/line-mini-app";

test("profile, follow and Repository discovery HTTP surfaces verify LINE and call owner use cases", async () => {
  const previousOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://app.example";
  const user = `U${"7".repeat(32)}`;
  const profile = {
    userId: "user-a",
    login: "alice",
    displayName: "Alice",
    bio: null,
    avatarRef: null,
    visibility: "private" as const,
    version: 1,
    createdAt: 10,
    updatedAt: 10,
  };

  const achievementRead = mock.method(achievements, "list", async () => []);
  const profileRead = mock.method(profiles, "get", async () => profile);
  const profileUpdate = mock.method(profiles, "update", async () => profile);
  const followers = mock.method(follows, "followers", async () => []);
  const following = mock.method(follows, "following", async () => []);
  const follow = mock.method(follows, "follow", async () => {});
  const accessible = mock.method(repositoryCollection, "accessible", async () => [
    {
      id: "repository-a",
      ownerLogin: "acme",
      name: "Repository A",
      capability: "read" as const,
    },
  ]);
  const discover = mock.method(repositoryDiscovery, "discover", async () => ({
    trending: [
      {
        id: "repository-a",
        ownerLogin: "acme",
        name: "Repository A",
        visibility: "private",
        capability: "read" as const,
        recentStarCount: 1,
        starCount: 1,
        starred: false,
      },
    ],
    activity: [],
  }));
  const star = mock.method(repositoryStars, "star", async () => {});
  const starred = mock.method(repositoryStars, "starred", async () => [
    {
      id: "repository-a",
      ownerLogin: "acme",
      name: "Repository A",
      visibility: "private",
      starredAt: 10,
      starCount: 1,
    },
  ]);
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

  const request = (path: string, body?: string, origin = "https://app.example") =>
    new Request(`https://app.example${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "x-line-token": "offline-social",
      },
      body,
    });

  try {
    assert.equal((await profileGet(request("/api/profile"))).status, 200);
    assert.equal((await achievementsGet(request("/api/profile/achievements"))).status, 200);
    assert.equal(
      (
        await profilePost(
          request(
            "/api/profile",
            JSON.stringify({
              login: "alice",
              displayName: "Alice",
              bio: null,
              visibility: "private",
              expectedVersion: 0,
            }),
          ),
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await profilePost(
          request(
            "/api/profile",
            JSON.stringify({
              displayName: "Alice",
              bio: null,
              visibility: "private",
              expectedVersion: 0,
            }),
            "https://evil.example",
          ),
        )
      ).status,
      403,
    );

    assert.equal((await followsGet(request("/api/follows"))).status, 200);
    assert.equal(
      (
        await followsPost(
          request("/api/follows", JSON.stringify({ action: "follow", targetUserId: "user-b" })),
        )
      ).status,
      200,
    );

    assert.equal((await repositoriesGet(request("/api/repositories"))).status, 200);
    assert.equal((await exploreGet(request("/api/repositories/explore"))).status, 200);
    assert.equal((await starredGet(request("/api/repositories/starred"))).status, 200);
    assert.equal(
      (
        await explorePost(
          request(
            "/api/repositories/explore",
            JSON.stringify({ action: "star", repositoryId: "repository-a" }),
          ),
        )
      ).status,
      200,
    );

    assert.equal(achievementRead.mock.callCount(), 1);
    assert.equal(profileRead.mock.callCount(), 1);
    assert.equal(profileUpdate.mock.callCount(), 1);
    assert.equal(followers.mock.callCount(), 1);
    assert.equal(following.mock.callCount(), 1);
    assert.equal(follow.mock.callCount(), 1);
    assert.equal(accessible.mock.callCount(), 1);
    assert.equal(discover.mock.callCount(), 1);
    assert.equal(starred.mock.callCount(), 1);
    assert.equal(star.mock.callCount(), 1);
  } finally {
    fetch.mock.restore();
    achievementRead.mock.restore();
    profileRead.mock.restore();
    profileUpdate.mock.restore();
    followers.mock.restore();
    following.mock.restore();
    follow.mock.restore();
    accessible.mock.restore();
    discover.mock.restore();
    starred.mock.restore();
    star.mock.restore();
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
  }
});
