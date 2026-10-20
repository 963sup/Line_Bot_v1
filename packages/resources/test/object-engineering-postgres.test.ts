import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { createObjects } from "../src/application/use-cases/objects.js";
import { createPostgresObjectDependencies } from "../src/composition/bootstrap/objects.js";

const databaseUrl = process.env.CAPABILITY_TEST_DATABASE_URL;
test("engineering PostgreSQL serializes concurrent allocation, exact replay and failed batch receipts", {
  skip: !databaseUrl && !process.env.CI,
  timeout: 120_000,
}, async (t) => {
  assert.ok(databaseUrl, "CI must supply disposable PostgreSQL");
  const { pool, db, close, waitForBlocked } = await postgresSessions(databaseUrl);
  t.after(close);
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt") VALUES('owner','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
  });
  await pool.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Engineering','private')",
  );
  const app = createObjects({ ...createPostgresObjectDependencies(db), now: Date.now });
  const typeId = randomUUID(),
    measureId = randomUUID(),
    rootId = randomUUID();
  const envelope = () => ({ repositoryId: "repo", requestId: randomUUID(), expectedVersion: 0 });
  const quantity = (value: string) => ({
    measureId,
    value,
    purpose: "PLANNED",
    sourceReference: null,
  });
  await app.executeType("owner", {
    ...envelope(),
    action: "create",
    typeId,
    name: "敷設",
    description: "",
  });
  await app.executeEngineering("owner", {
    ...envelope(),
    action: "create-measure",
    measureId,
    name: "光纖",
    subject: "路徑長度",
    unit: "m",
  });
  await app.executeObject("owner", {
    ...envelope(),
    action: "create",
    objectId: rootId,
    typeId,
    name: "A",
    content: "",
  });
  const structure = () => app.structure("owner", { repositoryId: "repo", rootId });
  await app.executeEngineering("owner", {
    ...envelope(),
    action: "set-quantities",
    observed: (await structure()).observed,
    changes: [{ objectId: rootId, expectedVersion: 1, quantity: quantity("1000") }],
  });
  async function race(commands: readonly unknown[]) {
    const blocker = await pool.connect();
    let pending:
      | Promise<PromiseSettledResult<Awaited<ReturnType<typeof app.executeEngineering>>>[]>
      | undefined;
    try {
      await blocker.query("BEGIN; SELECT app_private.lock_governance('exclusive')");
      const pid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() pid")).rows[0]
        ?.pid;
      assert.ok(pid);
      pending = Promise.allSettled(
        commands.map((command) => app.executeEngineering("owner", command)),
      );
      await waitForBlocked(pid, commands.length);
      await blocker.query("COMMIT");
      return await pending;
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      await pending;
    }
  }
  const observed = (await structure()).observed;
  const child = (name: string) => ({
    ...envelope(),
    action: "create-child",
    objectId: randomUUID(),
    typeId,
    parentObjectId: rootId,
    relationshipId: randomUUID(),
    kind: "ALLOCATES",
    name,
    content: "",
    quantity: quantity("600"),
    observed,
  });
  const first = child("B"),
    second = child("C");
  const raced = await race([first, second]);
  assert.equal(raced.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(raced.filter((result) => result.status === "rejected").length, 1);
  assert.equal((await structure()).allocated, "600");
  const winner = raced[0]?.status === "fulfilled" ? first : second;
  const committed = raced.find((result) => result.status === "fulfilled");
  assert.ok(committed && committed.status === "fulfilled");
  assert.deepEqual(await app.executeEngineering("owner", winner), committed.value);
  const fresh = await structure();
  const exact = {
    ...envelope(),
    action: "create-child",
    objectId: randomUUID(),
    typeId,
    parentObjectId: rootId,
    relationshipId: randomUUID(),
    kind: "ALLOCATES",
    name: "D",
    content: "",
    quantity: quantity("400"),
    observed: fresh.observed,
  };
  const replayed = await race([exact, exact]);
  assert.equal(
    replayed.every((result) => result.status === "fulfilled"),
    true,
  );
  if (replayed[0]?.status === "fulfilled" && replayed[1]?.status === "fulfilled")
    assert.deepEqual(replayed[0].value, replayed[1].value);
  assert.equal((await structure()).allocated, "1000");
  const before = await structure();
  const batch = {
    ...envelope(),
    action: "set-quantities",
    observed: before.observed,
    changes: [
      { objectId: winner.objectId, expectedVersion: 1, quantity: quantity("500") },
      { objectId: exact.objectId, expectedVersion: 1, quantity: quantity("500") },
    ],
  };
  await pool.query(
    `CREATE FUNCTION app_private.reject_engineering_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt unavailable'; END $$; CREATE TRIGGER reject_engineering_receipt BEFORE INSERT ON app_private.object_commands FOR EACH ROW EXECUTE FUNCTION app_private.reject_engineering_receipt()`,
  );
  await assert.rejects(app.executeEngineering("owner", batch));
  await pool.query(
    "DROP TRIGGER reject_engineering_receipt ON app_private.object_commands; DROP FUNCTION app_private.reject_engineering_receipt()",
  );
  assert.deepEqual(await structure(), before);
  const result = await app.executeEngineering("owner", batch);
  assert.equal(result.kind, "engineering");
  assert.equal((await structure()).allocated, "1000");
  const rows = await pool.query<{ count: string }>(
    "SELECT count(*) FROM app_private.object_commands WHERE actor_user_id='owner' AND request_id=$1",
    [batch.requestId],
  );
  assert.equal(rows.rows[0]?.count, "1");
});
