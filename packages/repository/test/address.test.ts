import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresRepositoryAddressStore } from "../src/adapters/postgres/address.js";
import { createRepositoryAddress } from "../src/application/address.js";
import type { RepositoryAddressStore } from "../src/application/ports/address.js";
import { RepositoryError } from "../src/domain.js";
import { repositoryAttendanceSites } from "../src/postgres/address.js";

async function activeUser(db: Database, id: string, login = id) {
  await db.transaction(async (sql) => {
    await sql.query(
      "insert into users(id,status,status_version,\"createdAt\") values($1,'active',1,1)",
      [id],
    );
    await sql.query("select app_private.claim_account_login($1,'USER',$2,1)", [id, login]);
  });
}

test("Repository address application validates the full address value before persistence", async () => {
  const calls: unknown[][] = [];
  const store = {
    view: async () => {
      throw new Error("not used");
    },
    execute: async (...args: unknown[]) => {
      calls.push(args);
      return {
        requestId: "11111111-1111-4111-8111-111111111111",
        repositoryId: "repo",
        address: null,
        version: 2,
        at: 10,
      };
    },
  } as RepositoryAddressStore;
  const service = createRepositoryAddress({
    activeUser: async () => ({ id: "actor" }),
    store: () => store,
    now: () => 10,
  });

  await service.execute("subject", {
    action: "set",
    requestId: "11111111-1111-4111-8111-111111111111",
    repositoryId: "repo",
    expectedVersion: 1,
    address: {
      address: "台北市信義區市府路 1 號",
      latitude: 25.0375,
      longitude: 121.5637,
      radius: 100,
    },
  });
  assert.equal(calls[0]?.[0], "actor");
  assert.equal(calls[0]?.[2], 10);

  await assert.rejects(
    service.execute("subject", {
      action: "set",
      requestId: "22222222-2222-4222-8222-222222222222",
      repositoryId: "repo",
      expectedVersion: 1,
      address: {
        address: "台北",
        latitude: 91,
        longitude: 121,
        radius: 100,
      },
    }),
    (error) => error instanceof RepositoryError && error.status === 400,
  );
  await assert.rejects(
    service.execute("subject", {
      action: "remove",
      requestId: "33333333-3333-4333-8333-333333333333",
      repositoryId: "repo",
      expectedVersion: 1,
      address: null,
    }),
    (error) => error instanceof RepositoryError && error.status === 400,
  );
});

test("Repository address is admin-managed, replay-safe and visible only to effective members", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await activeUser(db, "owner", "alice");
  await activeUser(db, "member");
  await activeUser(db, "visitor");
  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values('repo','owner','USER','Operations','public',1)",
  );
  await pg.query(
    "insert into app_private.repository_access(repository_id,principal_id,capability,version) values('repo','member','read',1)",
  );

  const store = new PostgresRepositoryAddressStore(db);
  const command = {
    action: "set" as const,
    requestId: "11111111-1111-4111-8111-111111111111",
    repositoryId: "repo",
    expectedVersion: 1,
    address: {
      address: "台北市信義區市府路 1 號",
      latitude: 25.0375,
      longitude: 121.5637,
      radius: 100,
    },
  };
  const changed = await store.execute("owner", command, 10);
  assert.equal(changed.version, 2);
  assert.deepEqual(await store.execute("owner", command, 11), changed);
  await assert.rejects(
    store.execute(
      "owner",
      {
        action: "set",
        requestId: "99999999-9999-4999-8999-999999999999",
        repositoryId: "repo",
        expectedVersion: 2,
        address: {
          radius: 100,
          longitude: 121.5637,
          address: "台北市信義區市府路 1 號",
          latitude: 25.0375,
        },
      },
      12,
    ),
    (error) => error instanceof RepositoryError && error.status === 409,
  );
  const unchanged = await pg.query("select version from app_private.repositories where id='repo'");
  assert.deepEqual(unchanged.rows, [{ version: 2 }]);
  await assert.rejects(
    store.execute("owner", { ...command, address: { ...command.address, radius: 200 } }, 12),
    (error) => error instanceof RepositoryError && error.status === 409,
  );
  await assert.rejects(
    store.execute(
      "member",
      {
        ...command,
        requestId: "22222222-2222-4222-8222-222222222222",
        expectedVersion: 2,
      },
      12,
    ),
    (error) => error instanceof RepositoryError && error.status === 403,
  );

  const memberView = await store.view("member", {
    ownerLogin: "alice",
    repositoryName: "operations",
  });
  assert.equal(memberView.repository.actorUserId, "member");
  assert.equal(memberView.repository.actorCapability, "read");
  assert.deepEqual(memberView.address, command.address);
  await assert.rejects(
    store.view("visitor", { repositoryId: "repo" }),
    (error) => error instanceof RepositoryError && error.status === 403,
  );

  const memberSites = await db.transaction((sql) => repositoryAttendanceSites(sql, "member"));
  assert.deepEqual(memberSites, [
    {
      id: "repo",
      name: "Operations",
      ...command.address,
      version: 2,
    },
  ]);
  assert.deepEqual(await db.transaction((sql) => repositoryAttendanceSites(sql, "visitor")), []);

  await pg.query(
    "delete from app_private.repository_access where repository_id='repo' and principal_id='member'",
  );
  assert.deepEqual(await db.transaction((sql) => repositoryAttendanceSites(sql, "member")), []);

  const removed = await store.execute(
    "owner",
    {
      action: "remove",
      requestId: "33333333-3333-4333-8333-333333333333",
      repositoryId: "repo",
      expectedVersion: 2,
    },
    13,
  );
  assert.equal(removed.version, 3);
  assert.equal(removed.address, null);
  assert.deepEqual(await db.transaction((sql) => repositoryAttendanceSites(sql, "owner")), []);
});
