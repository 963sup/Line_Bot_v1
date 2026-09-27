import assert from "node:assert/strict";
import test from "node:test";
import { createUserAchievements } from "../src/application/achievements.js";
import type { UserAchievementStore } from "../src/application/ports/achievements.js";
import { UserError } from "../src/domain/user.js";

test("achievement reads resolve the active User and keep the owner store authoritative", async () => {
  const calls: Array<{ userId: string; limit: number }> = [];
  const store: UserAchievementStore = {
    async list(userId, limit) {
      calls.push({ userId, limit });
      return [
        {
          id: "first-repository",
          name: "First Repository",
          description: "Created a first Repository.",
          iconRef: null,
          sourceKind: "repository",
          sourceId: "repo-1",
          awardedAt: 10,
        },
      ];
    },
  };
  const achievements = createUserAchievements({
    activeUser: async (subject) => ({ id: `user:${subject}` }),
    store: () => store,
  });

  const items = await achievements.list("line-a", 3);
  assert.equal(items[0]?.id, "first-repository");
  assert.deepEqual(calls, [{ userId: "user:line-a", limit: 3 }]);
  await assert.rejects(() => achievements.list("line-a", 0), UserError);
  await assert.rejects(() => achievements.list("line-a", 51), UserError);
});
