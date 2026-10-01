import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresRepositoryCreationStore } from "../src/adapters/postgres/creation.js";
import { PostgresRepositoryDiscoveryStore } from "../src/adapters/postgres/discovery.js";
import { PostgresRepositoryManagementStore } from "../src/adapters/postgres/management.js";
import { PostgresRepositoryStarListStore } from "../src/adapters/postgres/star-lists.js";
import { PostgresRepositoryStarStore } from "../src/adapters/postgres/stars.js";
import { RepositoryError } from "../src/domain.js";
import { authorizedRepository } from "../src/postgres/access.js";

async function activeUser(db: Database, id: string) {
  await db.transaction(async (sql) => {
    await sql.query(
      "insert into users(id,status,status_version,\"createdAt\") values($1,'active',1,1)",
      [id],
    );
    await sql.query("select app_private.claim_account_login($1,'USER',$2,1)", [id, id]);
  });
}

test("INTERNAL, PUBLIC and PRIVATE visibility re-authorize every read projection", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  for (const id of ["owner", "enterprise-user", "outsider"]) await activeUser(db, id);

  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "org",
    "owner",
    "acme",
    "Acme",
    2,
  ]);
  await pg.query("select * from app_private.provision_enterprise_scope($1,$2,$3,$4,$5)", [
    "enterprise",
    "owner",
    "enterprise",
    "Enterprise",
    3,
  ]);
  await pg.query(
    "insert into app_private.enterprise_organizations(enterprise_account_id,organization_account_id,status,version,attached_at) values('enterprise','org','active',1,4)",
  );
  await pg.query(
    "insert into app_private.enterprise_direct_affiliations(enterprise_account_id,user_id,status,version,created_at) values('enterprise','enterprise-user','active',1,5)",
  );

  const creation = new PostgresRepositoryCreationStore(db);
  assert.deepEqual(
    (await creation.owners("owner")).find((candidate) => candidate.id === "org"),
    {
      id: "org",
      kind: "ORGANIZATION",
      login: "acme",
      internalEligible: true,
    },
  );
  const repository = await creation.create(
    "owner",
    {
      requestId: "11111111-1111-4111-8111-111111111111",
      ownerAccountId: "org",
      ownerKind: "ORGANIZATION",
      name: "Internal",
      visibility: "internal",
    },
    10,
  );
  assert.equal(repository.visibility, "internal");

  await pg.query(
    "insert into app_private.projects(id,owner_account_id,owner_account_kind,name,version) values('project','owner','USER','Plan',1)",
  );
  await pg.query(
    "insert into app_private.project_repository_references(project_id,repository_id,position,version) values('project',$1,0,1)",
    [repository.id],
  );
  await pg.query(
    "insert into app_private.repository_star_lists(id,owner_user_id,name,description,visibility,version,created_at,updated_at) values('list','owner','List','','public',1,10,10)",
  );
  await pg.query(
    "insert into app_private.repository_star_list_items(list_id,owner_user_id,repository_id,added_at) values('list','owner',$1,10)",
    [repository.id],
  );

  const visibleProjectReferences = async (userId: string) =>
    (
      await pg.query(
        `select project_id,repository_id
         from app_private.project_repository_visible_references
         where project_id='project' and (user_id=$1 or user_id is null)
         order by repository_id`,
        [userId],
      )
    ).rows;

  const internalRead = await db.transaction((sql) =>
    authorizedRepository(sql, { userId: "enterprise-user" }, { repositoryId: repository.id }),
  );
  assert.deepEqual(internalRead.permissions, []);
  await assert.rejects(
    db.transaction((sql) =>
      authorizedRepository(sql, { userId: "outsider" }, { repositoryId: repository.id }),
    ),
    (error) => error instanceof RepositoryError && error.status === 403,
  );

  const discovery = new PostgresRepositoryDiscoveryStore(db);
  assert.deepEqual(
    (
      await discovery.snapshot("enterprise-user", { recentSince: 0, trendingLimit: 20 })
    ).trending.map((item) => ({ id: item.id, permissions: item.permissions })),
    [{ id: repository.id, permissions: [] }],
  );
  assert.deepEqual(await discovery.snapshot("outsider", { recentSince: 0, trendingLimit: 20 }), {
    trending: [],
  });

  const stars = new PostgresRepositoryStarStore(db);
  await stars.star("enterprise-user", repository.id, 11);
  await assert.rejects(
    stars.star("outsider", repository.id, 12),
    (error) => error instanceof RepositoryError && error.status === 403,
  );

  const lists = new PostgresRepositoryStarListStore(db);
  assert.equal((await lists.detail("enterprise-user", "list")).visibleRepositoryCount, 1);
  assert.equal((await lists.detail("outsider", "list")).visibleRepositoryCount, 0);
  assert.deepEqual(await visibleProjectReferences("enterprise-user"), [
    { project_id: "project", repository_id: repository.id },
  ]);
  assert.deepEqual(await visibleProjectReferences("outsider"), []);

  const management = new PostgresRepositoryManagementStore(db);
  const madePublic = await management.execute(
    "owner",
    {
      action: "visibility",
      requestId: "22222222-2222-4222-8222-222222222222",
      repositoryId: repository.id,
      expectedVersion: 1,
      visibility: "public",
    },
    20,
  );
  assert.equal(madePublic.version, 2);
  assert.equal((await lists.detail("outsider", "list")).visibleRepositoryCount, 1);
  assert.deepEqual(await visibleProjectReferences("outsider"), [
    { project_id: "project", repository_id: repository.id },
  ]);

  const madePrivate = await management.execute(
    "owner",
    {
      action: "visibility",
      requestId: "33333333-3333-4333-8333-333333333333",
      repositoryId: repository.id,
      expectedVersion: 2,
      visibility: "private",
    },
    21,
  );
  assert.equal(madePrivate.version, 3);
  await assert.rejects(
    db.transaction((sql) =>
      authorizedRepository(sql, { userId: "enterprise-user" }, { repositoryId: repository.id }),
    ),
    (error) => error instanceof RepositoryError && error.status === 403,
  );
  assert.deepEqual(await stars.starred("enterprise-user"), []);
  assert.equal((await lists.detail("enterprise-user", "list")).visibleRepositoryCount, 0);
  assert.deepEqual(await visibleProjectReferences("enterprise-user"), []);

  const madeInternal = await management.execute(
    "owner",
    {
      action: "visibility",
      requestId: "44444444-4444-4444-8444-444444444444",
      repositoryId: repository.id,
      expectedVersion: 3,
      visibility: "internal",
    },
    22,
  );
  assert.equal(madeInternal.version, 4);
  assert.equal(
    (
      await db.transaction((sql) =>
        authorizedRepository(sql, { userId: "enterprise-user" }, { repositoryId: repository.id }),
      )
    ).id,
    repository.id,
  );

  await pg.query(
    "update app_private.enterprise_organizations set status='detached',version=version+1,detached_at=30 where enterprise_account_id='enterprise' and organization_account_id='org'",
  );
  await assert.rejects(
    db.transaction((sql) =>
      authorizedRepository(sql, { userId: "enterprise-user" }, { repositoryId: repository.id }),
    ),
    (error) => error instanceof RepositoryError && error.status === 403,
  );
  assert.deepEqual(await visibleProjectReferences("enterprise-user"), []);

  await pg.query(
    "insert into app_private.repository_access(repository_id,principal_id,capability,version) values($1,'enterprise-user','read',1)",
    [repository.id],
  );
  const explicitAfterDetach = await db.transaction((sql) =>
    authorizedRepository(sql, { userId: "enterprise-user" }, { repositoryId: repository.id }),
  );
  assert.deepEqual(explicitAfterDetach.permissions, ["read"]);
  assert.deepEqual(await visibleProjectReferences("enterprise-user"), [
    { project_id: "project", repository_id: repository.id },
  ]);
});
