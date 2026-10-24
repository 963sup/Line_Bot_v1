import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createFiles } from "@line_bot_v1/file/application/use-cases/files";
import {
  createPostgresFileDependencies,
  createPostgresSavedFileResults,
} from "@line_bot_v1/file/composition/bootstrap/files";
import { plainTextProcessor } from "@line_bot_v1/file/composition/bootstrap/processors";
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
import { createPostgresContentPlanDependencies } from "../src/composition/bootstrap/plans.js";
import { ContentError } from "../src/domain/error.js";

type FileObjectStore = NonNullable<Parameters<typeof createPostgresFileDependencies>[1]>;

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
    createPostgresSavedFileResults,
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
    createPostgresSavedFileResults,
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

test("Content imports one verified SAVED File observation and pins immutable provenance", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await seedRepository(db);
  const stored = new Map<string, Uint8Array>();
  const objects: FileObjectStore = {
    async putVerified(revision, bytes) {
      stored.set(revision.id, Uint8Array.from(bytes));
    },
    async readVerified(revision) {
      const bytes = stored.get(revision.id);
      if (!bytes) throw new Error("Test File object was not found.");
      return Uint8Array.from(bytes);
    },
  };
  const files = createFiles({ ...createPostgresFileDependencies(db, objects), now: () => 10 });
  const fileId = randomUUID();
  const uploaded = await files.upload(
    "owner",
    {
      repositoryId: "repo",
      fileId,
      requestId: randomUUID(),
      expectedVersion: 0,
      name: "agreement.txt",
      mediaType: "text/plain",
    },
    new TextEncoder().encode("Assembly quantity: 26 SET"),
  );
  const runId = randomUUID();
  const ready = await files.run(
    "owner",
    {
      repositoryId: "repo",
      runId,
      fileId,
      fileRevisionId: uploaded.file.revisionId,
      requestId: randomUUID(),
      expectedVersion: 0,
    },
    plainTextProcessor,
  );
  assert.equal(ready.processing.state, "READY");
  const saved = await files.result("owner", {
    action: "save",
    repositoryId: "repo",
    runId,
    requestId: randomUUID(),
    expectedVersion: ready.processing.version,
    edits: [],
  });
  assert.equal(saved.processing.state, "SAVED");
  const observation = saved.processing.savedResult?.observations[0];
  assert.ok(observation);
  const plans = createContentPlans({
    ...createPostgresContentPlanDependencies(db),
    now: () => 100,
  });
  const initial = contentCommand("repo");
  const created = await plans.execute("owner", {
    ...initial.command,
    document: { ...initial.command.document, resourcePins: [] },
  });
  const workId = randomUUID();
  const measureId = randomUUID();
  const command = {
    action: "import-file",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: created.revision.version,
    confirmedDisclosure: true,
    source: {
      runId,
      processingRevisionId: saved.processing.revisionId,
      observationId: observation.id,
    },
    target: {
      id: workId,
      parentId: initial.ids.subobject,
      kind: "WORK",
      title: "Reviewed installation work",
      body: "User-verified plan basis",
      measureId,
      quantity: "26.000",
      newMeasure: { id: measureId, name: "Assemblies", subject: "Installed", unit: "SET" },
    },
  } as const;
  const imported = await plans.execute("owner", command);
  assert.equal(imported.revision.version, created.revision.version + 1);
  assert.equal(imported.revision.action, "import-file");
  assert.equal(imported.revision.document.nodes.at(-1)?.id, workId);
  assert.equal(imported.revision.document.nodes.at(-1)?.plannedQuantity?.value, "26");
  assert.equal(imported.revision.document.measures.at(-1)?.unit, "SET");
  assert.equal(Object.hasOwn(imported.revision, "fileImport"), false);
  assert.deepEqual(await plans.execute("owner", command), imported);
  const storedSource = (
    await db.transaction((sql) =>
      sql.query("SELECT file_import FROM content_plan_revisions WHERE id=$1", [
        imported.revision.revisionId,
      ]),
    )
  ).rows[0]?.file_import;
  assert.deepEqual(storedSource, {
    repositoryId: "repo",
    fileId,
    fileRevisionId: uploaded.file.revisionId,
    fileSha256: uploaded.file.sha256,
    runId,
    processingRevisionId: saved.processing.revisionId,
    observationId: observation.id,
    uncertain: observation.uncertain,
    nodeId: workId,
  });
  assert.equal((await plans.read("owner", { repositoryId: "repo" })).version, 2);
  assert.equal(
    (await plans.history("owner", { repositoryId: "repo" })).revisions[0]?.document.nodes.at(-1)
      ?.id,
    workId,
  );
  await assert.rejects(
    plans.execute("owner", {
      ...command,
      requestId: randomUUID(),
      expectedVersion: 2,
      source: { ...command.source, processingRevisionId: ready.processing.revisionId },
      target: { ...command.target, id: randomUUID() },
    }),
    (error) => error instanceof ContentError && error.code === "NOT_FOUND",
  );
  assert.equal((await plans.read("owner", { repositoryId: "repo" })).version, 2);
});
