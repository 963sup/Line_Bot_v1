import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createObjects } from "../src/application/use-cases/objects.js";
import { createPostgresResourceQuantityReader } from "../src/composition/bootstrap/engineering-references.js";
import { createPostgresObjectDependencies } from "../src/composition/bootstrap/objects.js";
import { ObjectError } from "../src/domain/error.js";

test("engineering reference reader returns ordered pinned quantity bases under current policy", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt") VALUES('owner','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
  });
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Resources','private')",
  );

  const app = createObjects({ ...createPostgresObjectDependencies(db), now: Date.now });
  const typeId = randomUUID();
  const measureId = randomUUID();
  const envelope = () => ({ repositoryId: "repo", requestId: randomUUID(), expectedVersion: 0 });
  await app.executeType("owner", {
    ...envelope(),
    action: "create",
    typeId,
    name: "Work",
    description: "",
  });
  await app.executeEngineering("owner", {
    ...envelope(),
    action: "create-measure",
    measureId,
    name: "Cable",
    subject: "Installed route length",
    unit: "m",
  });

  const resources: { resourceId: string; revisionId: string }[] = [];
  for (const name of ["First", "Second", "Without quantity"]) {
    const resourceId = randomUUID();
    const receipt = await app.executeObject("owner", {
      ...envelope(),
      action: "create",
      objectId: resourceId,
      typeId,
      name,
      content: "",
    });
    assert.equal(receipt.kind, "object");
    resources.push({ resourceId, revisionId: receipt.result.id });
  }
  const [first, second, withoutQuantity] = resources;
  assert.ok(first && second && withoutQuantity);

  const pinQuantity = async (resourceId: string, value: string) => {
    const observed = (await app.structure("owner", { repositoryId: "repo", rootId: resourceId }))
      .observed;
    const receipt = await app.executeEngineering("owner", {
      ...envelope(),
      action: "set-quantities",
      observed,
      changes: [
        {
          objectId: resourceId,
          expectedVersion: 1,
          quantity: { measureId, value, purpose: "REFERENCE", sourceReference: null },
        },
      ],
    });
    const revision = receipt.result.objects[0];
    assert.ok(revision);
    return revision.id;
  };
  const firstRevisionId = await pinQuantity(first.resourceId, "1.250");
  const secondRevisionId = await pinQuantity(second.resourceId, "2");
  await app.executeObject("owner", {
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 2,
    action: "archive",
    objectId: first.resourceId,
  });

  const ordered = await db.transaction((sql) =>
    createPostgresResourceQuantityReader(sql).verifyPinned(
      "owner",
      "repo",
      [
        {
          resourceId: second.resourceId,
          resourceRevisionId: secondRevisionId,
        },
        {
          resourceId: first.resourceId,
          resourceRevisionId: firstRevisionId,
        },
      ],
      { allowArchived: true },
    ),
  );
  assert.deepEqual(ordered, [
    {
      resourceId: second.resourceId,
      resourceRevisionId: secondRevisionId,
      resourceVersion: 2,
      name: "Second",
      measure: {
        id: measureId,
        name: "Cable",
        subject: "Installed route length",
        unit: "m",
      },
      sourceQuantity: "2",
    },
    {
      resourceId: first.resourceId,
      resourceRevisionId: firstRevisionId,
      resourceVersion: 2,
      name: "First",
      measure: {
        id: measureId,
        name: "Cable",
        subject: "Installed route length",
        unit: "m",
      },
      sourceQuantity: "1.25",
    },
  ]);

  await assert.rejects(
    db.transaction((sql) =>
      createPostgresResourceQuantityReader(sql).verifyPinned(
        "owner",
        "repo",
        [{ resourceId: first.resourceId, resourceRevisionId: firstRevisionId }],
        { allowArchived: false },
      ),
    ),
    (error) => error instanceof ObjectError && error.code === "OBJECT_ARCHIVED",
  );
  await assert.rejects(
    db.transaction((sql) =>
      createPostgresResourceQuantityReader(sql).verifyPinned(
        "owner",
        "repo",
        [
          { resourceId: second.resourceId, resourceRevisionId: secondRevisionId },
          {
            resourceId: withoutQuantity.resourceId,
            resourceRevisionId: withoutQuantity.revisionId,
          },
        ],
        { allowArchived: true },
      ),
    ),
    (error) => error instanceof ObjectError && error.code === "LIFECYCLE_CONFLICT",
  );
});
