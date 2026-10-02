import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresRepositoryResourceManagementStore } from "../src/adapters/postgres/resource-management.js";
import { createRepositoryResourceManagement } from "../src/application/resource-management.js";
import type { RepositoryResourceManagementStore } from "../src/contracts/output/resource-management.js";
import { RepositoryError } from "../src/domain.js";

async function activeUser(db: Database, id: string, login = id) {
  await db.transaction(async (sql) => {
    await sql.query(
      "insert into users(id,status,status_version,\"createdAt\") values($1,'active',1,1)",
      [id],
    );
    await sql.query("select app_private.claim_account_login($1,'USER',$2,1)", [id, login]);
  });
}

async function repositoryFixture() {
  const fixture = await postgresFixture();
  await activeUser(fixture.db, "owner", "alice");
  await activeUser(fixture.db, "viewer", "viewer");
  await fixture.pg.query(
    "select * from app_private.provision_repository($1,$2,$3,'USER',$4,'private')",
    ["repo", "owner", "owner", "Alpha"],
  );
  return fixture;
}

test("Repository resource application canonicalizes definitions before persistence", async () => {
  const calls: unknown[][] = [];
  const store = {
    execute: async (...args: unknown[]) => {
      calls.push(args);
      return {
        requestId: "11111111-1111-4111-8111-111111111111",
        repositoryId: "repo",
        action: "create-label",
        label: {
          id: "label",
          repositoryId: "repo",
          name: "bug",
          color: "aabbcc",
          description: "",
          version: 1,
        },
        deleted: false,
        at: 10,
      } as const;
    },
  } as RepositoryResourceManagementStore;
  const management = createRepositoryResourceManagement({
    activeUser: async () => ({ id: "owner" }),
    store: () => store,
    now: () => 10,
  });

  await management.execute("subject", {
    action: "create-label",
    requestId: "11111111-1111-4111-8111-111111111111",
    repositoryId: "repo",
    expectedVersion: 0,
    name: "  bug  ",
    color: "AABBCC",
  });
  assert.deepEqual(calls[0], [
    "owner",
    {
      action: "create-label",
      requestId: "11111111-1111-4111-8111-111111111111",
      repositoryId: "repo",
      expectedVersion: 0,
      name: "bug",
      color: "aabbcc",
      description: "",
    },
    10,
  ]);

  await assert.rejects(
    management.execute("subject", {
      action: "create-milestone",
      requestId: "22222222-2222-4222-8222-222222222222",
      repositoryId: "repo",
      expectedVersion: 1,
      title: "Release",
    }),
    (error) => error instanceof RepositoryError && error.status === 400,
  );
});

test("Label management preserves stable identity, replay, current authority and references", async (t) => {
  const { pg, db } = await repositoryFixture();
  t.after(() => pg.close());
  const store = new PostgresRepositoryResourceManagementStore(db);

  const create = {
    action: "create-label" as const,
    requestId: "11111111-1111-4111-8111-111111111111",
    repositoryId: "repo",
    expectedVersion: 0,
    name: "bug",
    color: "ff0000",
    description: "Bug report",
  };
  const created = await store.execute("owner", create, 10);
  assert.equal(created.action, "create-label");
  if (created.action !== "create-label") throw new Error("unexpected receipt");
  assert.equal(created.label.version, 1);
  assert.deepEqual(await store.execute("owner", create, 11), created);

  const updated = await store.execute(
    "owner",
    {
      action: "update-label",
      requestId: "22222222-2222-4222-8222-222222222222",
      repositoryId: "repo",
      expectedVersion: 1,
      labelId: created.label.id,
      name: "defect",
    },
    12,
  );
  assert.equal(updated.action, "update-label");
  if (updated.action !== "update-label") throw new Error("unexpected receipt");
  assert.equal(updated.label.id, created.label.id);
  assert.equal(updated.label.name, "defect");
  assert.equal(updated.label.version, 2);

  await assert.rejects(
    store.execute(
      "viewer",
      {
        action: "update-label",
        requestId: "33333333-3333-4333-8333-333333333333",
        repositoryId: "repo",
        expectedVersion: 2,
        labelId: created.label.id,
        description: "forbidden",
      },
      13,
    ),
    (error) => error instanceof RepositoryError && error.status === 403,
  );

  await pg.query(
    `insert into app_private.issues(
       id,repository_id,number,publisher,title,body,criteria,state,workflow_status,version,created_at,updated_at
     ) values('issue','repo',1,'owner','Issue','','','OPEN','pending',1,1,1)`,
  );
  await pg.query(
    "insert into app_private.issue_labels(repository_id,issue_id,label_id,added_by,created_at) values('repo','issue',$1,'owner',14)",
    [created.label.id],
  );

  const remove = {
    action: "delete-label" as const,
    requestId: "44444444-4444-4444-8444-444444444444",
    repositoryId: "repo",
    expectedVersion: 2,
    labelId: created.label.id,
  };
  await assert.rejects(
    store.execute("owner", remove, 15),
    (error) => error instanceof RepositoryError && error.status === 409,
  );
  assert.equal(
    Number(
      (
        (
          await pg.query(
            "select count(*)::int as count from app_private.repository_labels where id=$1",
            [created.label.id],
          )
        ).rows[0] as { count?: number }
      )?.count,
    ),
    1,
  );

  await pg.query("delete from app_private.issue_labels where issue_id='issue' and label_id=$1", [
    created.label.id,
  ]);
  const deleted = await store.execute("owner", remove, 16);
  assert.equal(deleted.action, "delete-label");
  if (deleted.action !== "delete-label") throw new Error("unexpected receipt");
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.label.id, created.label.id);

  const events = await pg.query(
    "select action from app_private.repository_events where repository_id='repo' order by id",
  );
  assert.deepEqual(
    (events.rows as Array<{ action: string }>).map((row) => row.action),
    ["create-label", "update-label", "delete-label"],
  );
});

test("Milestone management allocates repository-local numbers and enforces version/archive state", async (t) => {
  const { pg, db } = await repositoryFixture();
  t.after(() => pg.close());
  const store = new PostgresRepositoryResourceManagementStore(db);

  const first = await store.execute(
    "owner",
    {
      action: "create-milestone",
      requestId: "11111111-1111-4111-8111-111111111111",
      repositoryId: "repo",
      expectedVersion: 0,
      title: "M1",
      description: "",
      dueAt: null,
    },
    20,
  );
  const second = await store.execute(
    "owner",
    {
      action: "create-milestone",
      requestId: "22222222-2222-4222-8222-222222222222",
      repositoryId: "repo",
      expectedVersion: 0,
      title: "M2",
      description: "",
      dueAt: 100,
    },
    21,
  );
  if (first.action !== "create-milestone" || second.action !== "create-milestone") {
    throw new Error("unexpected receipt");
  }
  assert.equal(first.milestone.number, 1);
  assert.equal(second.milestone.number, 2);

  const close = {
    action: "close-milestone" as const,
    requestId: "33333333-3333-4333-8333-333333333333",
    repositoryId: "repo",
    expectedVersion: 1,
    milestoneId: first.milestone.id,
  };
  const closed = await store.execute("owner", close, 22);
  assert.equal(closed.action, "close-milestone");
  if (closed.action !== "close-milestone") throw new Error("unexpected receipt");
  assert.equal(closed.milestone.status, "closed");
  assert.equal(closed.milestone.version, 2);
  assert.deepEqual(await store.execute("owner", close, 23), closed);

  await assert.rejects(
    store.execute(
      "owner",
      {
        action: "update-milestone",
        requestId: "44444444-4444-4444-8444-444444444444",
        repositoryId: "repo",
        expectedVersion: 1,
        milestoneId: first.milestone.id,
        title: "stale",
      },
      24,
    ),
    (error) => error instanceof RepositoryError && error.status === 409,
  );

  const changed = await store.execute(
    "owner",
    {
      action: "update-milestone",
      requestId: "55555555-5555-4555-8555-555555555555",
      repositoryId: "repo",
      expectedVersion: 1,
      milestoneId: second.milestone.id,
      title: "Release",
      dueAt: null,
    },
    25,
  );
  assert.equal(changed.action, "update-milestone");
  if (changed.action !== "update-milestone") throw new Error("unexpected receipt");
  assert.equal(changed.milestone.id, second.milestone.id);
  assert.equal(changed.milestone.title, "Release");
  assert.equal(changed.milestone.dueAt, null);
  assert.equal(changed.milestone.version, 2);

  await pg.query("update app_private.repositories set is_archived=true where id='repo'");
  await assert.rejects(
    store.execute(
      "owner",
      {
        action: "create-milestone",
        requestId: "66666666-6666-4666-8666-666666666666",
        repositoryId: "repo",
        expectedVersion: 0,
        title: "Blocked",
        description: "",
        dueAt: null,
      },
      26,
    ),
    (error) => error instanceof RepositoryError && error.status === 409,
  );
});
