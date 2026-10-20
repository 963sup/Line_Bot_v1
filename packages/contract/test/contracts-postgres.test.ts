import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { createObjects } from "@line_bot_v1/resources/application/use-cases/objects";
import { createPostgresObjectDependencies } from "@line_bot_v1/resources/composition/bootstrap/objects";
import { createContracts } from "../src/application/use-cases/contracts.js";
import { createPostgresContractDependencies } from "../src/composition/bootstrap/contracts.js";
import { createPostgresContractReferenceReader } from "../src/composition/bootstrap/references.js";
import { reviseContract } from "../src/domain/contract.js";
import { ContractError } from "../src/domain/error.js";

async function seedResource(
  db: Parameters<typeof createPostgresObjectDependencies>[0],
  repositoryId = "repo",
) {
  const resources = createObjects({ ...createPostgresObjectDependencies(db), now: () => 50 });
  const typeId = randomUUID();
  const measureId = randomUUID();
  const envelope = () => ({ repositoryId, requestId: randomUUID(), expectedVersion: 0 });
  await resources.executeType("owner", {
    ...envelope(),
    action: "create",
    typeId,
    name: "Work",
    description: "",
  });
  await resources.executeEngineering("owner", {
    ...envelope(),
    action: "create-measure",
    measureId,
    name: "Cable",
    subject: "Installed route length",
    unit: "m",
  });
  const resourceId = randomUUID();
  await resources.executeObject("owner", {
    ...envelope(),
    action: "create",
    objectId: resourceId,
    typeId,
    name: "Cable A",
    content: "source",
  });
  const observed = (await resources.structure("owner", { repositoryId, rootId: resourceId }))
    .observed;
  const quantity = await resources.executeEngineering("owner", {
    ...envelope(),
    action: "set-quantities",
    observed,
    changes: [
      {
        objectId: resourceId,
        expectedVersion: 1,
        quantity: {
          measureId,
          value: "10",
          purpose: "REFERENCE",
          sourceReference: null,
        },
      },
    ],
  });
  const revision = quantity.result.objects[0];
  assert.ok(revision);
  return { resources, resourceId, resourceRevisionId: revision.id, typeId, measureId };
}

test("Contract persists atomic revisions, replay and established active line references", async (t) => {
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
  const source = await seedResource(db);
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
        resourceId: source.resourceId,
        resourceRevisionId: source.resourceRevisionId,
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
  await assert.rejects(
    contracts.execute("owner", { ...create, title: "changed" }),
    (error) => error instanceof ContractError && error.code === "REQUEST_ID_REUSED",
  );
  await assert.rejects(
    contracts.read("owner", { repositoryId: "other", contractId }),
    (error) => error instanceof ContractError && error.code === "NOT_FOUND",
  );

  await source.resources.executeObject("owner", {
    action: "edit",
    repositoryId: "repo",
    objectId: source.resourceId,
    requestId: randomUUID(),
    expectedVersion: 2,
    name: "Cable A revised",
    content: "new source",
  });
  const activate = {
    action: "activate",
    repositoryId: "repo",
    contractId,
    requestId: randomUUID(),
    expectedVersion: 1,
  } as const;
  const active = await contracts.execute("owner", activate);
  assert.equal(active.revision.state, "ACTIVE");
  assert.equal(active.revision.lines[0]?.resource.resourceRevisionId, source.resourceRevisionId);
  assert.equal(active.revision.lines[0]?.resource.name, "Cable A");

  const reference = await db.transaction((sql) =>
    createPostgresContractReferenceReader(sql).verifyLine(
      "owner",
      "repo",
      { contractId, contractRevisionId: active.revision.revisionId, lineId },
      { requireActive: true },
    ),
  );
  assert.equal(reference.agreedQuantity, "20");

  const activationBlockedId = randomUUID();
  await contracts.execute("owner", {
    ...create,
    contractId: activationBlockedId,
    requestId: randomUUID(),
  });

  await source.resources.executeObject("owner", {
    action: "archive",
    repositoryId: "repo",
    objectId: source.resourceId,
    requestId: randomUUID(),
    expectedVersion: 3,
  });
  await assert.rejects(
    contracts.execute("owner", {
      action: "activate",
      repositoryId: "repo",
      contractId: activationBlockedId,
      requestId: randomUUID(),
      expectedVersion: 1,
    }),
    (error) => error instanceof ContractError && error.code === "SOURCE_INVALID",
  );
  await assert.rejects(
    contracts.execute("owner", {
      ...create,
      contractId: randomUUID(),
      requestId: randomUUID(),
    }),
    (error) => error instanceof ContractError && error.code === "SOURCE_INVALID",
  );
  assert.deepEqual(
    await db.transaction((sql) =>
      createPostgresContractReferenceReader(sql).verifyLine(
        "owner",
        "repo",
        { contractId, contractRevisionId: active.revision.revisionId, lineId },
        { requireActive: true },
      ),
    ),
    reference,
  );

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
  assert.equal(
    (
      await db.transaction((sql) =>
        createPostgresContractReferenceReader(sql).verifyLine(
          "owner",
          "repo",
          { contractId, contractRevisionId: active.revision.revisionId, lineId },
          { requireActive: false },
        ),
      )
    ).lineId,
    lineId,
  );
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
  const source = await seedResource(db);
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
        resourceId: source.resourceId,
        resourceRevisionId: source.resourceRevisionId,
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
