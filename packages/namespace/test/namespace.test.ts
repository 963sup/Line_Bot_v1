import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresNamespaceStore } from "../src/postgres.js";
import {
  claimNamespace,
  NamespaceError,
  normalizeAccountLogin,
  renameNamespace,
  resolveNamespace,
} from "../src/index.js";

test("global Account login normalization is owned by Namespace", async () => {
  assert.equal(normalizeAccountLogin(" Alice-2 "), "alice-2");
  assert.throws(
    () => normalizeAccountLogin("settings"),
    (error) => error instanceof NamespaceError && error.status === 400,
  );
  assert.equal(
    await resolveNamespace(
      {
        resolve: async () => null,
        read: async () => null,
        readMany: async () => [],
        claim: async () => {
          throw new Error("unused");
        },
        rename: async () => {
          throw new Error("unused");
        },
      },
      "../invalid",
    ),
    null,
  );
});

test("Postgres Namespace claim replays, rejects collision, and rename uses observed CAS", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  const alice = { id: "namespace-user-a", kind: "USER" as const };
  const bob = { id: "namespace-user-b", kind: "USER" as const };

  await db.transaction(async (sql) => {
    await sql.query("insert into users(id,status,\"createdAt\") values($1,'active',$2)", [
      alice.id,
      1,
    ]);
    const store = new PostgresNamespaceStore(sql);
    assert.deepEqual(await claimNamespace(store, alice, " Alice ", 1), {
      ...alice,
      login: "alice",
    });
    assert.deepEqual(await claimNamespace(store, alice, "alice", 2), {
      ...alice,
      login: "alice",
    });
  });

  await assert.rejects(
    db.transaction((sql) =>
      claimNamespace(new PostgresNamespaceStore(sql), alice, "renamed-without-cas", 3),
    ),
    (error) => error instanceof NamespaceError && error.status === 409,
  );
  assert.deepEqual(await db.transaction((sql) => new PostgresNamespaceStore(sql).read(alice)), {
    ...alice,
    login: "alice",
  });

  await assert.rejects(
    db.transaction(async (sql) => {
      await sql.query("insert into users(id,status,\"createdAt\") values($1,'active',$2)", [
        bob.id,
        2,
      ]);
      await claimNamespace(new PostgresNamespaceStore(sql), bob, "alice", 2);
    }),
    (error) => error instanceof NamespaceError && error.status === 409,
  );
  assert.equal(
    (await pg.query("select 1 from app_private.users where id=$1", [bob.id])).rows.length,
    0,
  );

  await db.transaction(async (sql) => {
    await sql.query("insert into users(id,status,\"createdAt\") values($1,'active',$2)", [
      bob.id,
      3,
    ]);
    await claimNamespace(new PostgresNamespaceStore(sql), bob, "bob", 3);
  });
  await assert.rejects(
    db.transaction((sql) =>
      renameNamespace(new PostgresNamespaceStore(sql), bob, "stale", "carol", 4),
    ),
    (error) => error instanceof NamespaceError && error.status === 409,
  );

  await db.transaction(async (sql) => {
    const store = new PostgresNamespaceStore(sql);
    assert.deepEqual(await store.read(bob), { ...bob, login: "bob" });
    assert.deepEqual(await renameNamespace(store, bob, "bob", "carol", 5), {
      ...bob,
      login: "carol",
    });
    assert.deepEqual(await resolveNamespace(store, "CAROL"), { ...bob, login: "carol" });
    assert.deepEqual(await store.readMany([bob, alice, bob]), [
      { ...alice, login: "alice" },
      { ...bob, login: "carol" },
    ]);
  });
});

test("claim accepts an identical binding inserted at the insertion boundary", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  const target = { id: "interleaved-user", kind: "USER" as const };
  // PGlite serializes transactions. Inject the winning row at BEFORE INSERT to exercise
  // the same unique-conflict branch deterministically; this is not multi-session evidence.
  await pg.exec(`
    create function app_private.inject_namespace_claim() returns trigger language plpgsql as $$
    begin
      if pg_trigger_depth() = 1 then
        insert into app_private.account_logins(account_id,account_kind,login,updated_at)
          values(new.account_id,new.account_kind,new.login,1);
      end if;
      return new;
    end $$;
    create trigger inject_namespace_claim before insert on app_private.account_logins
      for each row execute function app_private.inject_namespace_claim();
  `);
  assert.deepEqual(
    await db.transaction(async (sql) => {
      await sql.query("insert into users(id,status,\"createdAt\") values($1,'active',1)", [
        target.id,
      ]);
      return claimNamespace(new PostgresNamespaceStore(sql), target, "acme", 2);
    }),
    { ...target, login: "acme" },
  );
  assert.deepEqual(
    (
      await pg.query(
        "select login,updated_at from app_private.account_logins where account_id=$1",
        [target.id],
      )
    ).rows,
    [{ login: "acme", updated_at: 1 }],
  );
});
