import assert from "node:assert/strict";
import test from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { MAX_PROJECT_VIEW_NUMBER, numberLimit } from "../src/index.js";
import { allocateNumber, resolveNumber } from "../src/postgres.js";

async function allocateDiscussion(
  sql: Parameters<typeof allocateNumber>[0],
  repositoryId: string,
  discussionId: string,
  at: number,
) {
  const number = await allocateNumber(sql, {
    family: "repository-discussion",
    scopeKind: "REPOSITORY",
    scopeId: repositoryId,
    resourceKind: "DISCUSSION",
    resourceId: discussionId,
    at,
  });
  await sql.query(
    `INSERT INTO discussions(
       id,repository_id,number,author,title,body,category,state,version,created_at,updated_at
     ) VALUES($1,$2,$3,'numbering-owner','Test','Body','General','OPEN',1,$4,$4)
     ON CONFLICT (id) DO NOTHING`,
    [discussionId, repositoryId, number, at],
  );
  return number;
}

async function seedRepositories(
  query: (text: string, values?: unknown[]) => Promise<unknown>,
  repositoryIds: readonly string[],
) {
  await query(
    `DO $seed$
     BEGIN
       INSERT INTO app_private.users(id,status,"createdAt")
       VALUES ('numbering-owner','active',0) ON CONFLICT (id) DO NOTHING;
       PERFORM app_private.claim_account_login(
         'numbering-owner','USER','numbering-owner',0
       );
     END
     $seed$`,
  );
  for (const [index, repositoryId] of repositoryIds.entries())
    await query(
      `WITH inserted AS (
         INSERT INTO app_private.repositories(
           id,owner_account_id,owner_account_kind,name,visibility,is_archived,version
         ) VALUES($1,'numbering-owner','USER',$2,'private',false,1)
         ON CONFLICT (id) DO UPDATE SET name=excluded.name
         RETURNING id,name
       )
       SELECT app_private.claim_scoped_namespace_name(
         'repository-name','OWNER_ACCOUNT','numbering-owner','REPOSITORY',id,name,$3
       ) FROM inserted`,
      [repositoryId, `Numbering-${index}`, index + 1],
    );
}

test("family limits preserve consumer number ranges", () => {
  assert.equal(numberLimit("project-view"), MAX_PROJECT_VIEW_NUMBER);
  assert.equal(numberLimit("repository-work-item"), Number.MAX_SAFE_INTEGER);
});

test("Series time constraint round-trips through schema diff SQL without changing its bounds", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());
  const definition = async () => {
    const { rows } = await pg.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
       WHERE conrelid='app_private.number_series'::regclass
         AND conname='number_series_time_check'`,
    );
    const [row] = rows;
    assert.ok(row);
    return row.definition;
  };
  const before = await definition();
  for (let round = 0; round < 3; round++) {
    await pg.exec(`ALTER TABLE app_private.number_series
      DROP CONSTRAINT number_series_time_check,
      ADD CONSTRAINT number_series_time_check ${await definition()};`);
    assert.equal(await definition(), before);
  }
  const insert = (scope: string, createdAt: number, updatedAt: number) =>
    pg.query(
      `INSERT INTO app_private.number_series(
         family,scope_kind,scope_id,next_number,legacy_high_water,managed_from,created_at,updated_at
       ) VALUES('repository-discussion','REPOSITORY',$1,1,0,1,$2,$3)`,
      [scope, createdAt, updatedAt],
    );
  const maximum = Number.MAX_SAFE_INTEGER;
  const validTimes = [
    [0, 0],
    [0, maximum],
    [maximum, maximum],
  ] as const;
  for (const [index, [createdAt, updatedAt]] of validTimes.entries()) {
    await insert(`valid-time-${index}`, createdAt, updatedAt);
  }
  const invalidTimes = [
    [-1, 0],
    [maximum + 1, maximum + 1],
    [1, 0],
    [0, maximum + 1],
  ] as const;
  for (const [index, [createdAt, updatedAt]] of invalidTimes.entries()) {
    await assert.rejects(
      insert(`invalid-time-${index}`, createdAt, updatedAt),
      /number_series_time_check/,
    );
  }
});

test("allocation is scoped, replay-stable, resolvable, and rolls back with the caller", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await seedRepositories((text, values) => pg.query(text, values), ["repo-a", "repo-b"]);

  const discussion = {
    family: "repository-discussion" as const,
    scopeKind: "REPOSITORY" as const,
    scopeId: "repo-a",
    resourceKind: "DISCUSSION" as const,
    resourceId: "discussion-a",
    at: 10,
  };
  assert.equal(
    await db.transaction((sql) =>
      allocateDiscussion(sql, discussion.scopeId, discussion.resourceId, discussion.at),
    ),
    1,
  );
  assert.equal(
    await db.transaction((sql) =>
      allocateDiscussion(sql, discussion.scopeId, discussion.resourceId, 11),
    ),
    1,
  );
  assert.deepEqual(
    await db.transaction((sql) =>
      resolveNumber(
        sql,
        {
          family: discussion.family,
          scopeKind: discussion.scopeKind,
          scopeId: discussion.scopeId,
        },
        1,
      ),
    ),
    { resourceKind: "DISCUSSION", resourceId: "discussion-a", number: 1 },
  );
  assert.equal(
    await db.transaction((sql) => allocateDiscussion(sql, "repo-b", "discussion-b", 12)),
    1,
  );

  await assert.rejects(
    db.transaction(async (sql) => {
      await allocateDiscussion(sql, "repo-a", "rolled-back", 13);
      throw new Error("force rollback");
    }),
    /force rollback/,
  );
  assert.equal(
    await db.transaction((sql) => allocateDiscussion(sql, "repo-a", "after-rollback", 14)),
    2,
  );
});

test("committed allocations are immutable and application SQL cannot bypass the boundary", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await seedRepositories((text, values) => pg.query(text, values), ["repo-immutable"]);
  const input = {
    family: "repository-discussion" as const,
    scopeKind: "REPOSITORY" as const,
    scopeId: "repo-immutable",
    resourceKind: "DISCUSSION" as const,
    resourceId: "discussion-immutable-a",
    at: 20,
  };
  assert.equal(
    await db.transaction((sql) =>
      allocateDiscussion(sql, input.scopeId, input.resourceId, input.at),
    ),
    1,
  );

  await assert.rejects(
    pg.query(
      `DELETE FROM app_private.number_allocations
       WHERE family=$1 AND scope_kind=$2 AND scope_id=$3 AND number=1`,
      [input.family, input.scopeKind, input.scopeId],
    ),
    /number_allocation_immutable/,
  );
  await assert.rejects(
    pg.query(
      `UPDATE app_private.number_series SET next_number=next_number+1
       WHERE family=$1 AND scope_kind=$2 AND scope_id=$3`,
      [input.family, input.scopeKind, input.scopeId],
    ),
    /number_series_invalid_transition/,
  );
  await assert.rejects(
    db.transaction((sql) =>
      sql.query(
        `INSERT INTO number_allocations(
           family,scope_kind,scope_id,number,resource_kind,resource_id,provenance,allocated_at
         ) VALUES (
           'repository-discussion','REPOSITORY','repo-immutable',2,
           'DISCUSSION','bypass','MANAGED',21
         )`,
      ),
    ),
  );
  assert.equal(
    await db.transaction((sql) =>
      allocateDiscussion(sql, input.scopeId, "discussion-immutable-b", 22),
    ),
    2,
  );
});
