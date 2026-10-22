import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresRepositorySubscriptionStore } from "../src/composition/bootstrap/repository-subscription.js";
import { RepositoryError } from "../src/contracts/errors/repository-error.js";
import type {
  RepositorySubscriptionCommand,
  RepositorySubscriptionState,
} from "../src/contracts/input/repository-subscription.js";

test("Watch preserves missing, no-op, stale, replay authorization and archived behavior", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await pg.exec(`BEGIN;
    INSERT INTO app_private.users(id,status,status_version,"createdAt")
      VALUES ('owner','active',1,1),('viewer','active',1,1);
    SELECT app_private.claim_account_login(id,'USER',id,1)
      FROM app_private.users WHERE id IN ('owner','viewer');
    INSERT INTO app_private.repositories(
      id,owner_account_id,owner_account_kind,name,visibility,is_archived,version
    ) VALUES
      ('repo-default','owner','USER','Default','public',false,1),
      ('repo-private','owner','USER','Private','private',false,1),
      ('repo-archived','owner','USER','Archived','public',true,1);
    SELECT app_private.claim_scoped_namespace_name(
      'repository-name','OWNER_ACCOUNT',owner_account_id,'REPOSITORY',id,name,1
    ) FROM app_private.repositories WHERE owner_account_id='owner';
    INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version)
      VALUES ('repo-private','viewer','read',1);
    COMMIT;`);

  const store = new PostgresRepositorySubscriptionStore(db);
  assert.deepEqual(await store.view("viewer", { repositoryId: "repo-default" }), {
    repository: {
      id: "repo-default",
      actorUserId: "viewer",
      ownerLogin: "owner",
      name: "Default",
    },
    state: "UNSUBSCRIBED",
    version: 0,
  });

  const first = await store.execute(
    "viewer",
    {
      action: "set",
      requestId: "11111111-1111-4111-8111-111111111111",
      repositoryId: "repo-default",
      expectedVersion: 0,
      state: "UNSUBSCRIBED",
    },
    10,
  );
  assert.deepEqual(first, {
    requestId: "11111111-1111-4111-8111-111111111111",
    repositoryId: "repo-default",
    state: "UNSUBSCRIBED",
    version: 1,
    at: 10,
  });

  await assert.rejects(
    store.execute(
      "viewer",
      {
        action: "set",
        requestId: "22222222-2222-4222-8222-222222222222",
        repositoryId: "repo-default",
        expectedVersion: 1,
        state: "UNSUBSCRIBED",
      },
      11,
    ),
    (error: unknown) =>
      error instanceof RepositoryError &&
      error.status === 409 &&
      error.message === "Repository subscription 沒有變更。",
  );
  await assert.rejects(
    store.execute(
      "viewer",
      {
        action: "set",
        requestId: "33333333-3333-4333-8333-333333333333",
        repositoryId: "repo-default",
        expectedVersion: 0,
        state: "IGNORED",
      },
      12,
    ),
    (error: unknown) =>
      error instanceof RepositoryError &&
      error.status === 409 &&
      error.message === "Repository subscription 已更新，請重新載入。",
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT state,version FROM app_private.repository_subscriptions WHERE repository_id='repo-default' AND user_id='viewer'",
      )
    ).rows,
    [{ state: "UNSUBSCRIBED", version: 1 }],
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT request_id::text FROM app_private.repository_commands WHERE actor='viewer' ORDER BY request_id",
      )
    ).rows,
    [{ request_id: "11111111-1111-4111-8111-111111111111" }],
  );

  const privateCommand = {
    action: "set" as const,
    requestId: "44444444-4444-4444-8444-444444444444",
    repositoryId: "repo-private",
    expectedVersion: 0,
    state: "SUBSCRIBED" as const,
  };
  const privateReceipt = await store.execute("viewer", privateCommand, 20);
  await pg.query(
    "DELETE FROM app_private.repository_access WHERE repository_id='repo-private' AND principal_id='viewer'",
  );
  await assert.rejects(
    store.execute("viewer", privateCommand, 21),
    (error: unknown) => error instanceof RepositoryError && error.status === 403,
  );
  assert.deepEqual(
    (
      await pg.query(
        `SELECT s.state,s.version,c.result
         FROM app_private.repository_subscriptions s
         JOIN app_private.repository_commands c
           ON c.actor=s.user_id AND c.request_id=$1
         WHERE s.repository_id='repo-private' AND s.user_id='viewer'`,
        [privateCommand.requestId],
      )
    ).rows,
    [
      {
        state: "SUBSCRIBED",
        version: 1,
        result: {
          receiptVersion: 1,
          family: "repository-subscription",
          action: "set",
          result: privateReceipt,
        },
      },
    ],
  );

  assert.equal(
    (await store.view("viewer", { repositoryId: "repo-archived" })).state,
    "UNSUBSCRIBED",
  );
  assert.deepEqual(
    await store.execute(
      "viewer",
      {
        action: "set",
        requestId: "55555555-5555-4555-8555-555555555555",
        repositoryId: "repo-archived",
        expectedVersion: 0,
        state: "IGNORED",
      },
      30,
    ),
    {
      requestId: "55555555-5555-4555-8555-555555555555",
      repositoryId: "repo-archived",
      state: "IGNORED",
      version: 1,
      at: 30,
    },
  );
});

test("typed Watch execute snapshots caller-owned command before transaction work", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await pg.exec(`BEGIN;
    INSERT INTO app_private.users(id,status,status_version,"createdAt")
      VALUES ('owner','active',1,1),('viewer','active',1,1);
    SELECT app_private.claim_account_login(id,'USER',id,1)
      FROM app_private.users WHERE id IN ('owner','viewer');
    INSERT INTO app_private.repositories(
      id,owner_account_id,owner_account_kind,name,visibility,is_archived,version
    ) VALUES ('repo','owner','USER','Repo','public',false,1);
    SELECT app_private.claim_scoped_namespace_name(
      'repository-name','OWNER_ACCOUNT','owner','REPOSITORY','repo','Repo',1
    );
    COMMIT;`);

  const caller: {
    action: "set";
    requestId: string;
    repositoryId: string;
    expectedVersion: number;
    state: RepositorySubscriptionState;
  } = {
    action: "set" as const,
    requestId: "66666666-6666-4666-8666-666666666666",
    repositoryId: "repo",
    expectedVersion: 0,
    state: "SUBSCRIBED",
  };
  const original: RepositorySubscriptionCommand = { ...caller };
  const mutatingDatabase: Database = {
    transaction(work) {
      caller.state = "IGNORED";
      return db.transaction(work);
    },
  };
  const store = new PostgresRepositorySubscriptionStore(mutatingDatabase);
  const receipt = await store.execute("viewer", caller, 40);
  const rows = (
    await pg.query(
      `SELECT s.state,s.version,c.fingerprint,c.result
       FROM app_private.repository_subscriptions s
       JOIN app_private.repository_commands c
         ON c.actor=s.user_id AND c.request_id=$1
       WHERE s.repository_id='repo' AND s.user_id='viewer'`,
      [original.requestId],
    )
  ).rows;
  const expectedFingerprint = createHash("sha256")
    .update(JSON.stringify({ family: "repository-subscription", command: original }))
    .digest("hex");

  assert.deepEqual(
    { receipt, rows },
    {
      receipt: {
        requestId: original.requestId,
        repositoryId: original.repositoryId,
        state: "SUBSCRIBED",
        version: 1,
        at: 40,
      },
      rows: [
        {
          state: "SUBSCRIBED",
          version: 1,
          fingerprint: expectedFingerprint,
          result: {
            receiptVersion: 1,
            family: "repository-subscription",
            action: "set",
            result: {
              requestId: original.requestId,
              repositoryId: original.repositoryId,
              state: "SUBSCRIBED",
              version: 1,
              at: 40,
            },
          },
        },
      ],
    },
  );
});
