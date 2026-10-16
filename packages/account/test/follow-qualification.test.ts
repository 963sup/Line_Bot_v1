import assert from "node:assert/strict";
import test from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createFollows } from "../src/application/follows.js";
import { PostgresUserStore } from "../src/composition/bootstrap/user.js";
import { requireActiveUser } from "../src/domain/user.js";
import { PostgresFollowStore } from "../src/postgres/follows.js";

for (const action of ["follow", "unfollow"] as const) {
  test(`${action} rejects qualification lost after the application pre-read without changing the relationship`, async (t) => {
    const { pg, db } = await postgresFixture();
    t.after(() => pg.close());
    const subject = `U${"1".repeat(32)}`;
    await pg.exec(`INSERT INTO users(id,status,"createdAt") VALUES ('actor','active',1),('target','active',1);
      SELECT app_private.claim_account_login(id,'USER',login,1)
      FROM (VALUES ('actor','actor'),('target','target')) AS fixture(id,login);
      INSERT INTO user_identities(provider,subject,user_id) VALUES ('line:test','${subject}','actor');`);
    const users = new PostgresUserStore(db);
    const store = new PostgresFollowStore(db);
    if (action === "unfollow") await store.follow("actor", "target", 10);
    let qualified = false;
    const follows = createFollows({
      activeUser: async (proof) => {
        const actor = requireActiveUser(await users.find("line:test", proof));
        qualified = true;
        // An independent lifecycle commit occurs after the real identity-qualified read.
        await pg.exec("UPDATE users SET status='paused' WHERE id='actor'");
        return actor;
      },
      store: () => store,
      now: () => 20,
    });
    await assert.rejects(follows[action](subject, "target"), { status: 403 });
    assert.equal(qualified, true);
    assert.equal((await store.following("actor")).length, action === "follow" ? 0 : 1);
  });
}
