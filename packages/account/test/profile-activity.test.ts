import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line-work/platform/testing/postgres";
import { PostgresUserProfileActivityStore } from "../src/adapters/postgres/profile-activity.js";
import type { UserProfileActivityStore } from "../src/application/ports/profile-activity.js";
import { createUserProfileActivity } from "../src/application/profile-activity.js";

test("profile activity resolves the current active User before reading", async () => {
  const seen: string[] = [];
  const activity = createUserProfileActivity({
    activeUser: async () => ({ id: "user-a" }),
    store: () =>
      ({
        read: async (userId: string) => {
          seen.push(userId);
          return { achievements: [], contributions: [] };
        },
      }) satisfies UserProfileActivityStore,
  });

  assert.deepEqual(await activity.read("line-subject"), {
    achievements: [],
    contributions: [],
  });
  assert.deepEqual(seen, ["user-a"]);
});

test("Postgres profile activity returns earned recognition and contribution days only", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await pg.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
    "user-a",
    "active",
    1,
  ]);
  await pg.query(
    `insert into app_private.achievement_definitions(
       id,name,description,icon_ref,status,version,created_at
     ) values
       ('earned','Earned','Visible earned recognition',null,'active',1,1),
       ('draft','Draft','Must stay hidden',null,'draft',1,1)`,
  );
  await pg.query(
    `insert into app_private.user_achievements(
       user_id,achievement_id,source_kind,source_id,source_version,visibility,awarded_at,evidence
     ) values
       ('user-a','earned','system','source-a',1,'public',20,'{}'::jsonb),
       ('user-a','draft','system','source-b',1,'private',30,'{}'::jsonb)`,
  );
  await pg.query(
    `insert into app_private.user_contribution_days(
       user_id,day,contribution_count,source_version,updated_at
     ) values
       ('user-a','2026-09-26',3,1,30),
       ('user-a','2026-09-25',0,1,20)`,
  );

  const snapshot = await new PostgresUserProfileActivityStore(db).read("user-a");
  assert.deepEqual(snapshot.achievements, [
    {
      id: "earned",
      name: "Earned",
      description: "Visible earned recognition",
      iconRef: null,
      visibility: "public",
      awardedAt: 20,
      sourceKind: "system",
    },
  ]);
  assert.deepEqual(snapshot.contributions, [{ day: "2026-09-26", count: 3 }]);
});
