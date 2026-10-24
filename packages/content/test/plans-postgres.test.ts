import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { createResources } from "@line_bot_v1/resources/application/use-cases/resources";
import { createPostgresResourceReferenceReader } from "@line_bot_v1/resources/composition/bootstrap/resource-references";
import { createPostgresResourceDependencies } from "@line_bot_v1/resources/composition/bootstrap/resources";
import type { ResourceReferenceReader } from "@line_bot_v1/resources/contracts/output/resource-references";
import { PostgresContentPlans } from "../src/adapters/outbound/persistence/plans.js";
import { createContentPlans } from "../src/application/use-cases/plans.js";
import { createPostgresContentPlanReferenceReader } from "../src/composition/bootstrap/plan-references.js";
import { ContentError } from "../src/domain/error.js";

async function seedRepository(db: Database, repositoryId = "repo") {
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt") VALUES('owner','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
  });
  await db.transaction((sql) =>
    sql.query(
      "SELECT * FROM app_private.provision_repository($1,'owner','owner','USER','Content','private')",
      [repositoryId],
    ),
  );
}

function contentCommand(
  repositoryId = "repo",
  pin: { resource: string; resourceRevision: string } = {
    resource: randomUUID(),
    resourceRevision: randomUUID(),
  },
) {
  const subject = randomUUID();
  const object = randomUUID();
  const subobject = randomUUID();
  const work = randomUUID();
  const task = randomUUID();
  const measure = randomUUID();
  const { resource, resourceRevision } = pin;
  return {
    ids: { subject, object, subobject, work, task, measure, resource, resourceRevision },
    command: {
      action: "initialize" as const,
      repositoryId,
      requestId: randomUUID(),
      expectedVersion: 0,
      document: {
        schemaVersion: 1 as const,
        measures: [
          { id: measure, name: "Installation", subject: "Installed sets", unit: "SET" as const },
        ],
        nodes: [
          {
            id: subject,
            parentId: null,
            position: 0,
            kind: "SUBJECT" as const,
            title: "25P1",
            body: "",
            plannedQuantity: null,
          },
          {
            id: object,
            parentId: subject,
            position: 0,
            kind: "OBJECT" as const,
            title: "Network",
            body: "",
            plannedQuantity: null,
          },
          {
            id: subobject,
            parentId: object,
            position: 0,
            kind: "SUBOBJECT" as const,
            title: "Backbone",
            body: "",
            plannedQuantity: null,
          },
          {
            id: work,
            parentId: subobject,
            position: 0,
            kind: "WORK" as const,
            title: "Main fiber",
            body: "",
            plannedQuantity: { measureId: measure, value: "10.000" },
          },
          {
            id: task,
            parentId: work,
            position: 0,
            kind: "TASK" as const,
            title: "Splicing",
            body: "",
            plannedQuantity: { measureId: measure, value: "2.500" },
          },
        ],
        resourcePins: [
          {
            nodeId: task,
            resourceId: resource,
            resourceRevisionId: resourceRevision,
            kind: "EQUIPMENT" as const,
          },
        ],
      },
    },
  };
}

function countingResourceReader(
  calls: { count: number },
  delegate?: ResourceReferenceReader,
): ResourceReferenceReader {
  return {
    verifyPinned: async (_userId, _repositoryId, references) => {
      calls.count += 1;
      if (delegate)
        return delegate.verifyPinned(_userId, _repositoryId, references, { allowArchived: false });
      return references.map((reference) => ({
        ...reference,
        resourceVersion: 1,
        kind: "EQUIPMENT" as const,
        name: "Splicer",
      }));
    },
  };
}

test("Content persists complete revisions, replay, pins and exact historical references", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await seedRepository(db);
  const calls = { count: 0 };
  const resources = createResources({ ...createPostgresResourceDependencies(db), now: () => 50 });
  const resourceId = randomUUID();
  const createdResource = await resources.execute("owner", {
    action: "create",
    repositoryId: "repo",
    resourceId,
    requestId: randomUUID(),
    expectedVersion: 0,
    kind: "EQUIPMENT",
    name: "Splicer",
    description: "",
  });
  const persistence = new PostgresContentPlans(
    (sql) => countingResourceReader(calls, createPostgresResourceReferenceReader(sql)),
    () => ({
      readConfirmed: async () => {
        throw new Error("Unexpected Contract read.");
      },
    }),
    db,
  );
  const plans = createContentPlans({
    reads: persistence,
    transactions: persistence,
    now: () => 100,
  });
  const { ids, command } = contentCommand("repo", {
    resource: resourceId,
    resourceRevision: createdResource.revision.revisionId,
  });
  const first = await plans.execute("owner", command);
  assert.deepEqual(await plans.execute("owner", command), first);
  assert.equal(calls.count, 1);
  assert.equal(first.revision.document.nodes[4]?.plannedQuantity?.value, "2.5");
  assert.equal(first.revision.document.measures[0]?.unit, "SET");

  await resources.execute("owner", {
    action: "archive",
    repositoryId: "repo",
    resourceId,
    requestId: randomUUID(),
    expectedVersion: 1,
  });

  const replacement = {
    ...command,
    action: "replace" as const,
    requestId: randomUUID(),
    expectedVersion: 1,
    document: {
      ...first.revision.document,
      nodes: first.revision.document.nodes.map((node) =>
        node.id === ids.task ? { ...node, title: "Splicing complete definition" } : node,
      ),
    },
  };
  const second = await plans.execute("owner", replacement);
  assert.equal(second.revision.version, 2);
  assert.equal(calls.count, 1, "unchanged archived-capable pins are not requalified");
  const oldBasis = await db.transaction((sql) =>
    createPostgresContentPlanReferenceReader(sql).verifyPinned("owner", "repo", [
      { planRevisionId: first.revision.revisionId.toUpperCase(), nodeId: ids.task.toUpperCase() },
    ]),
  );
  assert.equal(oldBasis[0]?.node.title, "Splicing");
  assert.equal(oldBasis[0]?.node.plannedQuantity?.measure.unit, "SET");
  assert.deepEqual(
    oldBasis[0]?.node.path.map((node) => node.kind),
    ["SUBJECT", "OBJECT", "SUBOBJECT", "WORK", "TASK"],
  );
  assert.equal((await plans.read("owner", { repositoryId: "repo" })).version, 2);
  assert.deepEqual(
    (await plans.history("owner", { repositoryId: "repo" })).revisions.map(
      (revision) => revision.version,
    ),
    [2, 1],
  );

  await assert.rejects(
    plans.execute("owner", { ...replacement, document: { ...replacement.document, nodes: [] } }),
    (error) => error instanceof ContentError && error.code === "REQUEST_ID_REUSED",
  );
  const emptied = await plans.execute("owner", {
    action: "replace",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 2,
    document: {
      schemaVersion: 1,
      measures: first.revision.document.measures,
      nodes: [],
      resourcePins: [],
    },
  });
  assert.equal(emptied.revision.version, 3);
  await db.transaction((sql) =>
    createPostgresContentPlanReferenceReader(sql).verifyRevision(
      "owner",
      "repo",
      emptied.revision.revisionId.toUpperCase(),
    ),
  );
  await assert.rejects(
    db.transaction((sql) =>
      createPostgresContentPlanReferenceReader(sql).verifyRevision("owner", "repo", randomUUID()),
    ),
    (error) => error instanceof ContentError && error.code === "NOT_FOUND",
  );
  await assert.rejects(
    plans.execute("owner", {
      action: "replace",
      repositoryId: "repo",
      requestId: randomUUID(),
      expectedVersion: 3,
      document: {
        schemaVersion: 1,
        measures: first.revision.document.measures,
        nodes: [
          {
            id: ids.task,
            parentId: null,
            position: 0,
            kind: "SUBJECT",
            title: "Reused identity",
            body: "",
            plannedQuantity: null,
          },
        ],
        resourcePins: [],
      },
    }),
    (error) => error instanceof ContentError && error.code === "LIFECYCLE_CONFLICT",
  );
  await assert.rejects(
    db.transaction((sql) =>
      sql.query("UPDATE content_plan_revisions SET action='replace' WHERE id=$1", [
        first.revision.revisionId,
      ]),
    ),
  );
  await assert.rejects(
    db.transaction((sql) =>
      sql.query("DELETE FROM content_plan_resource_pins WHERE plan_revision_id=$1", [
        first.revision.revisionId,
      ]),
    ),
  );
  await assert.rejects(
    db.transaction((sql) =>
      sql.query("UPDATE content_plans SET repository_id='other' WHERE repository_id='repo'"),
    ),
  );
  await db.transaction((sql) =>
    sql.query("UPDATE repositories SET is_archived=true WHERE id='repo'"),
  );
  assert.deepEqual(await plans.execute("owner", command), first);
  await assert.rejects(
    plans.execute("owner", { ...replacement, requestId: randomUUID(), expectedVersion: 3 }),
    (error) => error instanceof ContentError && error.code === "LIFECYCLE_CONFLICT",
  );
});

const url = process.env.CAPABILITY_TEST_DATABASE_URL;
test("independent PostgreSQL sessions allow only one competing Content initializer", {
  skip: !url && !process.env.CI,
}, async (t) => {
  assert.ok(url, "CI requires its disposable PostgreSQL service");
  const { db, close } = await postgresSessions(url);
  t.after(close);
  await seedRepository(db);
  const persistence = new PostgresContentPlans(
    () => countingResourceReader({ count: 0 }),
    () => ({
      readConfirmed: async () => {
        throw new Error("Unexpected Contract read.");
      },
    }),
    db,
  );
  const plans = createContentPlans({ reads: persistence, transactions: persistence, now: () => 1 });
  const base = contentCommand().command;
  const empty = {
    ...base,
    document: { schemaVersion: 1 as const, measures: [], nodes: [], resourcePins: [] },
  };
  const results = await Promise.allSettled([
    plans.execute("owner", empty),
    plans.execute("owner", { ...empty, requestId: randomUUID() }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
});
