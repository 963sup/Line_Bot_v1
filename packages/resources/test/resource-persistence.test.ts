import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createResources } from "../src/application/use-cases/resources.js";
import { createPostgresResourceReferenceReader } from "../src/composition/bootstrap/resource-references.js";
import { createPostgresResourceDependencies } from "../src/composition/bootstrap/resources.js";
import { ResourceError } from "../src/domain/resource-error.js";

test("physical Resources preserve authorization, replay, rollback and current immutable pins", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt")
       VALUES('owner','active',1,1),('outsider','active',1,1),('member','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
  });
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Resources','private')",
  );
  await pg.query(
    "SELECT * FROM app_private.provision_repository('other','owner','owner','USER','Other','private')",
  );

  let clock = 10;
  const resources = createResources({
    ...createPostgresResourceDependencies(db),
    now: () => clock++,
  });
  const resourceId = randomUUID();
  const create = {
    action: "create",
    repositoryId: "repo",
    resourceId,
    requestId: randomUUID(),
    expectedVersion: 0,
    kind: "MATERIAL",
    name: "  24-core cable  ",
    description: "drum A",
  } as const;
  const first = await resources.execute("owner", create);
  assert.deepEqual(await resources.execute("owner", create), first);
  assert.equal(first.revision.name, "24-core cable");
  for (const [statement, values] of [
    ["UPDATE repository_resources SET kind='LOCATION' WHERE id=$1", [resourceId]],
    ["UPDATE repository_resources SET repository_id='other' WHERE id=$1", [resourceId]],
    ["UPDATE repository_resources SET id=$2 WHERE id=$1", [resourceId, randomUUID()]],
  ] as const)
    await assert.rejects(db.transaction((sql) => sql.query(statement, [...values])));
  await assert.rejects(
    resources.execute("owner", { ...create, name: "different" }),
    (error) => error instanceof ResourceError && error.code === "REQUEST_ID_REUSED",
  );
  await assert.rejects(
    resources.read("outsider", { repositoryId: "repo", resourceId }),
    (error) => error instanceof ResourceError && (error.status === 403 || error.status === 404),
  );
  await assert.rejects(
    db.transaction((sql) =>
      createPostgresResourceReferenceReader(sql).verifyPinned(
        "owner",
        "other",
        [{ resourceId, resourceRevisionId: first.revision.revisionId }],
        { allowArchived: false },
      ),
    ),
    (error) => error instanceof ResourceError && error.code === "NOT_FOUND",
  );

  const edit = await resources.execute("owner", {
    action: "edit",
    repositoryId: "repo",
    resourceId,
    requestId: randomUUID(),
    expectedVersion: 1,
    name: "24-core cable B",
    description: "drum B",
  });
  assert.equal(
    (
      await resources.read("owner", {
        repositoryId: "repo",
        resourceId,
        revisionId: first.revision.revisionId,
      })
    ).name,
    "24-core cable",
  );
  await assert.rejects(
    db.transaction((sql) =>
      createPostgresResourceReferenceReader(sql).verifyPinned(
        "owner",
        "repo",
        [{ resourceId, resourceRevisionId: first.revision.revisionId }],
        { allowArchived: false },
      ),
    ),
    (error) => error instanceof ResourceError && error.code === "SOURCE_INVALID",
  );
  const basis = await db.transaction((sql) =>
    createPostgresResourceReferenceReader(sql).verifyPinned(
      "owner",
      "repo",
      [{ resourceId, resourceRevisionId: edit.revision.revisionId }],
      { allowArchived: false },
    ),
  );
  assert.deepEqual(
    basis.map(({ kind, name }) => ({ kind, name })),
    [{ kind: "MATERIAL", name: "24-core cable B" }],
  );
  const uppercaseBasis = await db.transaction((sql) =>
    createPostgresResourceReferenceReader(sql).verifyPinned(
      "owner",
      "repo",
      [
        {
          resourceId: resourceId.toUpperCase(),
          resourceRevisionId: edit.revision.revisionId.toUpperCase(),
        },
      ],
      { allowArchived: false },
    ),
  );
  assert.equal(uppercaseBasis[0]?.resourceId, resourceId);
  const equipmentId = randomUUID();
  const equipment = await resources.execute("owner", {
    action: "create",
    repositoryId: "repo",
    resourceId: equipmentId,
    requestId: randomUUID(),
    expectedVersion: 0,
    kind: "EQUIPMENT",
    name: "Fusion splicer",
    description: "",
  });
  const ordered = await db.transaction((sql) =>
    createPostgresResourceReferenceReader(sql).verifyPinned(
      "owner",
      "repo",
      [
        {
          resourceId: equipmentId,
          resourceRevisionId: equipment.revision.revisionId,
        },
        { resourceId, resourceRevisionId: edit.revision.revisionId },
      ],
      { allowArchived: false },
    ),
  );
  assert.deepEqual(
    ordered.map(({ resourceId: id }) => id),
    [equipmentId, resourceId],
  );

  await pg.query(
    "INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version) VALUES('repo','member','write',1)",
  );
  const memberCommand = {
    action: "create",
    repositoryId: "repo",
    resourceId: randomUUID(),
    requestId: randomUUID(),
    expectedVersion: 0,
    kind: "LOCATION",
    name: "Member location",
    description: "",
  } as const;
  await resources.execute("member", memberCommand);
  await pg.query(
    "DELETE FROM app_private.repository_access WHERE repository_id='repo' AND principal_id='member'",
  );
  await assert.rejects(
    resources.execute("member", memberCommand),
    (error) => error instanceof ResourceError && (error.status === 403 || error.status === 404),
  );

  const archived = await resources.execute("owner", {
    action: "archive",
    repositoryId: "repo",
    resourceId,
    requestId: randomUUID(),
    expectedVersion: 2,
  });
  await assert.rejects(
    db.transaction((sql) =>
      createPostgresResourceReferenceReader(sql).verifyPinned(
        "owner",
        "repo",
        [{ resourceId, resourceRevisionId: archived.revision.revisionId }],
        { allowArchived: false },
      ),
    ),
    (error) => error instanceof ResourceError && error.code === "SOURCE_INVALID",
  );
  assert.equal(
    (
      await db.transaction((sql) =>
        createPostgresResourceReferenceReader(sql).verifyPinned(
          "owner",
          "repo",
          [{ resourceId, resourceRevisionId: archived.revision.revisionId }],
          { allowArchived: true },
        ),
      )
    )[0]?.resourceVersion,
    3,
  );

  const rollbackId = randomUUID();
  const rollbackRequest = randomUUID();
  await pg.query(`
    CREATE FUNCTION app_private.reject_test_resource_command()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'forced_resource_receipt_failure'; END
    $$
  `);
  await pg.query(`
    CREATE TRIGGER reject_test_resource_command
    BEFORE INSERT ON app_private.resource_commands
    FOR EACH ROW EXECUTE FUNCTION app_private.reject_test_resource_command()
  `);
  try {
    await assert.rejects(
      resources.execute("owner", {
        action: "create",
        repositoryId: "repo",
        resourceId: rollbackId,
        requestId: rollbackRequest,
        expectedVersion: 0,
        kind: "EQUIPMENT",
        name: "Rollback",
        description: "",
      }),
      (error) => error instanceof ResourceError && error.code === "UNAVAILABLE",
    );
  } finally {
    await pg.query("DROP TRIGGER reject_test_resource_command ON app_private.resource_commands");
    await pg.query("DROP FUNCTION app_private.reject_test_resource_command()");
  }
  const counts = await pg.query<{ heads: number; revisions: number; receipts: number }>(
    `SELECT
       (SELECT count(*)::int FROM app_private.repository_resources WHERE id=$1) heads,
       (SELECT count(*)::int FROM app_private.resource_revisions WHERE resource_id=$1) revisions,
       (SELECT count(*)::int FROM app_private.resource_commands WHERE request_id=$2) receipts`,
    [rollbackId, rollbackRequest],
  );
  assert.deepEqual(counts.rows, [{ heads: 0, revisions: 0, receipts: 0 }]);
});
