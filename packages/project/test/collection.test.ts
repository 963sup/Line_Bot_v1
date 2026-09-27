import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/adapters/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresProjectCollectionStore } from "../src/adapters/postgres/collection.js";
import { createProjectCollection } from "../src/application/collection.js";
import type { ProjectCollectionStore } from "../src/application/ports/collection.js";

test("Project collection resolves the active User before reading authorized Projects", async () => {
  const calls: string[] = [];
  const collection = createProjectCollection({
    activeUser: async (subject) => {
      calls.push(subject);
      return { id: "user-a" };
    },
    store: () =>
      ({
        accessible: async (userId: string) => {
          assert.equal(userId, "user-a");
          return [];
        },
      }) satisfies ProjectCollectionStore,
  });

  assert.deepEqual(await collection.accessible("line-subject"), { items: [] });
  assert.deepEqual(calls, ["line-subject"]);
});

async function activeUser(db: Database, id: string, login: string) {
  await db.transaction(async (sql) => {
    await sql.query(
      "insert into users(id,status,status_version,\"createdAt\") values($1,'active',1,1)",
      [id],
    );
    await sql.query("select app_private.claim_account_login($1,'USER',$2,1)", [id, login]);
  });
}

test("Postgres Project collection exposes personal and OrganizationOwner Projects only", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await activeUser(db, "owner", "alice");
  await activeUser(db, "member", "bob");
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "org",
    "owner",
    "acme",
    "Acme",
    2,
  ]);
  await pg.query(
    "insert into app_private.organization_memberships(organization_account_id,user_id,status,version,created_at) values('org','member','active',1,3)",
  );
  await pg.query(
    "insert into app_private.projects(id,owner_account_id,owner_account_kind,name,version) values ('personal','owner','USER','Personal Plan',1),('shared','org','ORGANIZATION','Shared Plan',1)",
  );

  const store = new PostgresProjectCollectionStore(db);
  assert.deepEqual(await store.accessible("owner"), [
    {
      id: "personal",
      ownerLogin: "alice",
      ownerKind: "USER",
      name: "Personal Plan",
      version: 1,
    },
    {
      id: "shared",
      ownerLogin: "acme",
      ownerKind: "ORGANIZATION",
      name: "Shared Plan",
      version: 1,
    },
  ]);
  assert.deepEqual(await store.accessible("member"), []);
});
