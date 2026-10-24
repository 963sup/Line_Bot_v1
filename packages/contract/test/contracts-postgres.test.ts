import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createContentPlans } from "@line_bot_v1/content/application/use-cases/plans";
import { createPostgresContentPlanDependencies } from "@line_bot_v1/content/composition/bootstrap/plans";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { createContracts } from "../src/application/use-cases/contracts.js";
import { createPostgresContractDependencies } from "../src/composition/bootstrap/contracts.js";
import { createPostgresContractReferenceReader } from "../src/composition/bootstrap/references.js";
import { reviseContract } from "../src/domain/contract.js";
import { ContractError } from "../src/domain/error.js";

async function seedContentPlan(db: Database, repositoryId = "repo") {
  const plans = createContentPlans({
    ...createPostgresContentPlanDependencies(db),
    now: () => 50,
  });
  const ids = {
    measure: randomUUID(),
    subject: randomUUID(),
    object: randomUUID(),
    subobject: randomUUID(),
    work: randomUUID(),
    task: randomUUID(),
  };
  const document = {
    schemaVersion: 1 as const,
    measures: [
      {
        id: ids.measure,
        name: "Length",
        subject: "Installed route length",
        unit: "SET" as const,
      },
    ],
    nodes: [
      {
        id: ids.subject,
        parentId: null,
        position: 0,
        kind: "SUBJECT" as const,
        title: "Contract works",
        body: "",
        plannedQuantity: null,
      },
      {
        id: ids.object,
        parentId: ids.subject,
        position: 0,
        kind: "OBJECT" as const,
        title: "Network",
        body: "",
        plannedQuantity: null,
      },
      {
        id: ids.subobject,
        parentId: ids.object,
        position: 0,
        kind: "SUBOBJECT" as const,
        title: "Backbone",
        body: "",
        plannedQuantity: null,
      },
      {
        id: ids.work,
        parentId: ids.subobject,
        position: 0,
        kind: "WORK" as const,
        title: "Install cable",
        body: "Work basis",
        plannedQuantity: { measureId: ids.measure, value: "100" },
      },
      {
        id: ids.task,
        parentId: ids.work,
        position: 0,
        kind: "TASK" as const,
        title: "Pull cable",
        body: "Task basis",
        plannedQuantity: { measureId: ids.measure, value: "10" },
      },
    ],
    resourcePins: [],
  };
  const first = await plans.execute("owner", {
    action: "initialize",
    repositoryId,
    requestId: randomUUID(),
    expectedVersion: 0,
    document,
  });
  return { plans, ids, document, first };
}

test("Contract persists Content-based revisions, replay and established active line references", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt") VALUES('owner','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
  });
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Contract','private')",
  );
  await pg.query(
    "SELECT * FROM app_private.provision_repository('other','owner','owner','USER','Other','private')",
  );
  const source = await seedContentPlan(db);
  let clock = 100;
  const store = createPostgresContractDependencies(db);
  const contracts = createContracts({ ...store, now: () => clock++ });
  const contractId = randomUUID();
  const lineId = randomUUID();
  const create = {
    action: "create",
    repositoryId: "repo",
    contractId,
    requestId: randomUUID(),
    expectedVersion: 0,
    title: "  Cable installation  ",
    body: "  raw terms\r\n",
    lines: [
      {
        lineId,
        planRevisionId: source.first.revision.revisionId,
        nodeId: source.ids.task,
        agreedQuantity: "20.000",
      },
    ],
  } as const;
  assert.deepEqual((await contracts.list("owner", "repo")).contracts, []);
  const draft = await contracts.execute("owner", create);
  assert.deepEqual(await contracts.execute("owner", create), draft);
  assert.equal(draft.revision.title, "Cable installation");
  assert.equal(draft.revision.body, "  raw terms\r\n");
  assert.equal(draft.revision.lines[0]?.agreedQuantity, "20");
  assert.equal(draft.revision.lines[0]?.content.node.plannedQuantity?.measure.unit, "SET");
  await assert.rejects(
    contracts.execute("owner", { ...create, title: "changed" }),
    (error) => error instanceof ContractError && error.code === "REQUEST_ID_REUSED",
  );
  await assert.rejects(
    contracts.read("owner", { repositoryId: "other", contractId }),
    (error) => error instanceof ContractError && error.code === "NOT_FOUND",
  );

  await source.plans.execute("owner", {
    action: "replace",
    repositoryId: "repo",
    requestId: randomUUID(),
    expectedVersion: 1,
    document: {
      ...source.document,
      nodes: source.document.nodes.map((node) =>
        node.id === source.ids.task ? { ...node, title: "Pull cable revised" } : node,
      ),
    },
  });
  const activate = {
    action: "activate",
    repositoryId: "repo",
    contractId,
    requestId: randomUUID(),
    expectedVersion: 1,
  } as const;
  const active = await contracts.execute("owner", activate);
  const activeLine = active.revision.lines[0];
  assert.equal(active.revision.state, "ACTIVE");
  assert.ok(activeLine && "content" in activeLine);
  assert.equal(activeLine.content.planRevisionId, source.first.revision.revisionId);
  assert.equal(activeLine.content.node.title, "Pull cable");
  assert.equal(activeLine.content.node.plannedQuantity?.measure.unit, "SET");
  assert.deepEqual(
    activeLine.content.node.path.map((item) => item.kind),
    ["SUBJECT", "OBJECT", "SUBOBJECT", "WORK", "TASK"],
  );

  const reference = await db.transaction((sql) =>
    createPostgresContractReferenceReader(sql).verifyLine(
      "owner",
      "repo",
      { contractId, contractRevisionId: active.revision.revisionId, lineId },
      { requireActive: true },
    ),
  );
  assert.ok("content" in reference);
  assert.equal(reference.content.node.title, "Pull cable");
  assert.equal(reference.agreedQuantity, "20");
  assert.equal(reference.content.node.plannedQuantity?.measure.unit, "SET");

  await assert.rejects(
    store.transactions.transact(
      "owner",
      { repositoryId: "repo", contractId },
      { requestId: create.requestId, payload: "forced receipt conflict" },
      async (tx) => {
        const current = await tx.contracts.load();
        const next = reviseContract(
          current,
          2,
          { action: "close" },
          {
            id: tx.nextId(),
            contractId,
            repositoryId: "repo",
            actorUserId: "owner",
            at: 200,
          },
        );
        await tx.contracts.save(next, 2);
        await tx.record(next);
      },
    ),
  );
  assert.equal((await contracts.read("owner", { repositoryId: "repo", contractId })).version, 2);

  const closed = await contracts.execute("owner", {
    action: "close",
    repositoryId: "repo",
    contractId,
    requestId: randomUUID(),
    expectedVersion: 2,
  });
  assert.equal(closed.revision.state, "CLOSED");
  await assert.rejects(
    db.transaction((sql) =>
      createPostgresContractReferenceReader(sql).verifyLine(
        "owner",
        "repo",
        { contractId, contractRevisionId: active.revision.revisionId, lineId },
        { requireActive: true },
      ),
    ),
    (error) => error instanceof ContractError && error.code === "SOURCE_INVALID",
  );
  const historical = await db.transaction((sql) =>
    createPostgresContractReferenceReader(sql).verifyLine(
      "owner",
      "repo",
      { contractId, contractRevisionId: active.revision.revisionId, lineId },
      { requireActive: false },
    ),
  );
  assert.ok("content" in historical);
  assert.equal(historical.lineId, lineId);
  assert.deepEqual(
    (await contracts.history("owner", { repositoryId: "repo", contractId })).revisions.map(
      (revision) => revision.state,
    ),
    ["CLOSED", "ACTIVE", "DRAFT"],
  );
  await assert.rejects(
    db.transaction((sql) =>
      sql.query("UPDATE engineering_contract_revisions SET body='tampered' WHERE id=$1", [
        draft.revision.revisionId,
      ]),
    ),
  );
  await assert.rejects(
    pg.query(
      `INSERT INTO app_private.engineering_contract_commands(
         actor_user_id,request_id,repository_id,contract_id,fingerprint,revision_id
       ) VALUES('owner',$1,'other',$2,'bad',$3)`,
      [randomUUID(), contractId, active.revision.revisionId],
    ),
  );
  const retiredContractId = randomUUID();
  const retiredRevisionId = randomUUID();
  await db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO engineering_contracts(id,repository_id,version,head_revision_id) VALUES($1,'repo',1,$2)",
      [retiredContractId, retiredRevisionId],
    );
    await sql.query(
      `INSERT INTO engineering_contract_revisions(
         id,contract_id,repository_id,version,parent_revision_id,actor_user_id,
         at,action,state,title,body,lines
       ) VALUES($1,$2,'repo',1,NULL,'owner',1,'create','DRAFT','retired','',$3::jsonb)`,
      [
        retiredRevisionId,
        retiredContractId,
        JSON.stringify([
          {
            lineId: randomUUID(),
            resource: { resourceId: randomUUID(), resourceRevisionId: randomUUID() },
            agreedQuantity: "1",
          },
        ]),
      ],
    );
  });
  await assert.rejects(
    contracts.read("owner", { repositoryId: "repo", contractId: retiredContractId }),
    (error) => error instanceof ContractError && error.code === "UNAVAILABLE",
  );
  await assert.rejects(
    pg.query(
      `INSERT INTO app_private.engineering_contract_revisions(
         id,contract_id,repository_id,version,parent_revision_id,actor_user_id,
         at,action,state,title,body,lines
       ) VALUES($1,$2,'repo',4,$3,'owner',300,'edit','DRAFT','bad parent','', $4::jsonb)`,
      [randomUUID(), contractId, randomUUID(), JSON.stringify(active.revision.lines)],
    ),
  );
  await assert.rejects(
    pg.query(
      `UPDATE app_private.engineering_contracts
       SET version=999 WHERE repository_id='repo' AND id=$1`,
      [contractId],
    ),
  );
  await pg.query("UPDATE app_private.repositories SET is_archived=true WHERE id='repo'");
  assert.deepEqual(await contracts.execute("owner", create), draft);
  await assert.rejects(
    contracts.execute("owner", { ...create, requestId: randomUUID() }),
    (error) => error instanceof ContractError && error.code === "LIFECYCLE_CONFLICT",
  );
});

const url = process.env.CAPABILITY_TEST_DATABASE_URL;
test("independent PostgreSQL sessions serialize Contract replay and competing activation", {
  skip: !url && !process.env.CI,
}, async (t) => {
  assert.ok(url, "CI requires its disposable PostgreSQL service");
  const { pool, db, close } = await postgresSessions(url);
  t.after(close);
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt") VALUES('owner','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
  });
  await pool.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Contract','private')",
  );
  const source = await seedContentPlan(db);
  const contracts = createContracts({ ...createPostgresContractDependencies(db), now: () => 1 });
  const command = {
    action: "create",
    repositoryId: "repo",
    contractId: randomUUID(),
    requestId: randomUUID(),
    expectedVersion: 0,
    title: "A",
    body: "",
    lines: [
      {
        lineId: randomUUID(),
        planRevisionId: source.first.revision.revisionId,
        nodeId: source.ids.task,
        agreedQuantity: "1",
      },
    ],
  } as const;
  const [first, replay] = await Promise.all([
    contracts.execute("owner", command),
    contracts.execute("owner", command),
  ]);
  assert.deepEqual(first, replay);
  const competing = await Promise.allSettled(
    [randomUUID(), randomUUID()].map((requestId) =>
      contracts.execute("owner", {
        action: "activate",
        repositoryId: "repo",
        contractId: command.contractId,
        requestId,
        expectedVersion: 1,
      }),
    ),
  );
  assert.equal(competing.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(competing.filter((result) => result.status === "rejected").length, 1);
});
