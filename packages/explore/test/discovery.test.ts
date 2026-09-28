import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  RepositoryDiscoveryOptions,
  RepositoryDiscoveryStore,
} from "@line_bot_v1/repository/contracts/discovery";
import { createRepositoryDiscovery } from "../src/application/queries/repository-discovery.js";

test("Repository discovery resolves the active User and applies one bounded trending window", async () => {
  let received:
    | {
        userId: string;
        options: RepositoryDiscoveryOptions;
      }
    | undefined;
  const store: RepositoryDiscoveryStore = {
    snapshot: async (userId, options) => {
      received = { userId, options };
      return { trending: [], activity: [] };
    },
    publishedStarLists: async (userId, limit) => {
      assert.equal(userId, "user-a");
      assert.equal(limit, 20);
      return [];
    },
  };
  const week = 7 * 24 * 60 * 60 * 1000;
  const discovery = createRepositoryDiscovery({
    activeUser: async () => ({ id: "user-a" }),
    store: () => store,
    now: () => week + 100,
  });

  assert.deepEqual(await discovery.discover("line-subject"), { trending: [], activity: [] });
  assert.deepEqual(received, {
    userId: "user-a",
    options: {
      recentSince: 100,
      trendingLimit: 20,
      activityLimit: 20,
    },
  });
  assert.deepEqual(await discovery.publishedStarLists("line-subject"), []);
});
