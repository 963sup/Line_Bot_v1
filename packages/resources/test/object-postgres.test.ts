import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { PostgresRepositoryAccessStore } from "@line_bot_v1/repository/postgres/access-management";
import { createObjects } from "../src/application/use-cases/objects.js";
import { createPostgresObjectDependencies } from "../src/composition/bootstrap/objects.js";
import { createPostgresObjectReferenceReader } from "../src/composition/bootstrap/references.js";

const databaseUrl = process.env.CAPABILITY_TEST_DATABASE_URL;

type Sessions = Awaited<ReturnType<typeof postgresSessions>>;

async function waitForBlockedChain(pool: Sessions["pool"], blockerPid: number, count: number) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const { rows } = await pool.query<{ pid: number }>(
      `WITH RECURSIVE waiting(pid,blocker_pid) AS (
         SELECT activity.pid,blocker.pid
         FROM pg_stat_activity activity
         CROSS JOIN LATERAL unnest(pg_blocking_pids(activity.pid)) AS blocker(pid)
         WHERE activity.datname=current_database() AND activity.wait_event_type='Lock'
         UNION
         SELECT waiting.pid,blocker.pid
         FROM waiting
         CROSS JOIN LATERAL unnest(pg_blocking_pids(waiting.blocker_pid)) AS blocker(pid)
       )
       SELECT DISTINCT pid FROM waiting WHERE blocker_pid=$1 ORDER BY pid`,
      [blockerPid],
    );
    if (rows.length === count) return rows;
    await setTimeout(20);
  }
  throw new Error(`Expected ${count} sessions in the blocking chain for backend ${blockerPid}`);
}

function status(error: unknown) {
  return error !== null && typeof error === "object" && "status" in error
    ? Number(error.status)
    : undefined;
}

test("Object PostgreSQL transactions preserve replay, versions, lifecycle and current access", {
  skip: !databaseUrl && !process.env.CI,
  timeout: 120_000,
}, async (t) => {
  assert.ok(databaseUrl, "CI must supply its disposable PostgreSQL service");
  const { pool, db, close, waitForBlocked } = await postgresSessions(databaseUrl);
  t.after(close);
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt")
         VALUES('owner','active',1,1),('member','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
  });
  await pool.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Objects','private')",
  );

  let clock = 10;
  const objects = createObjects({
    ...createPostgresObjectDependencies(db),
    now: () => clock++,
  });
  const access = new PostgresRepositoryAccessStore(db);
  const repositoryId = "repo";
  const primaryTypeId = randomUUID();
  await objects.executeType("owner", {
    action: "create",
    repositoryId,
    requestId: randomUUID(),
    expectedVersion: 0,
    typeId: primaryTypeId,
    name: "Document",
    description: "",
  });

  await t.test(
    "concurrent exact create replay commits one head, revision and receipt",
    async () => {
      const objectId = randomUUID();
      const command = {
        action: "create" as const,
        repositoryId,
        requestId: randomUUID(),
        expectedVersion: 0,
        objectId,
        typeId: primaryTypeId,
        name: "Replay-safe",
        content: "one",
      };
      const blocker = await pool.connect();
      let outcomes:
        | Promise<PromiseSettledResult<Awaited<ReturnType<typeof objects.executeObject>>>[]>
        | undefined;
      try {
        await blocker.query("BEGIN; SELECT app_private.lock_governance('exclusive')");
        const blockerPid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
          .rows[0]?.pid;
        assert.ok(blockerPid);
        outcomes = Promise.allSettled([
          objects.executeObject("owner", command),
          objects.executeObject("owner", command),
        ]);
        const waiting = await waitForBlocked(blockerPid, 2);
        assert.equal(new Set(waiting.map((row) => row.pid)).size, 2);
        await blocker.query("COMMIT");
        const settled = await outcomes;
        assert.equal(settled[0]?.status, "fulfilled");
        assert.deepEqual(settled[0], settled[1]);
      } finally {
        await blocker.query("ROLLBACK").catch(() => {});
        blocker.release();
        await outcomes;
      }

      const counts = await pool.query<{
        heads: number;
        revisions: number;
        receipts: number;
      }>(
        `SELECT
           (SELECT count(*)::int FROM app_private.objects WHERE id=$1) heads,
           (SELECT count(*)::int FROM app_private.object_revisions WHERE object_id=$1) revisions,
           (SELECT count(*)::int FROM app_private.object_commands WHERE request_id=$2) receipts`,
        [objectId, command.requestId],
      );
      assert.deepEqual(counts.rows, [{ heads: 1, revisions: 1, receipts: 1 }]);
    },
  );

  await t.test("competing edits accept only the first observed version", async () => {
    const objectId = randomUUID();
    await objects.executeObject("owner", {
      action: "create",
      repositoryId,
      requestId: randomUUID(),
      expectedVersion: 0,
      objectId,
      typeId: primaryTypeId,
      name: "Editable",
      content: "base",
    });
    const commands = ["first", "second"].map((content) => ({
      action: "edit" as const,
      repositoryId,
      requestId: randomUUID(),
      expectedVersion: 1,
      objectId,
      name: "Editable",
      content,
    }));
    const blocker = await pool.connect();
    let outcomes:
      | Promise<PromiseSettledResult<Awaited<ReturnType<typeof objects.executeObject>>>[]>
      | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM app_private.objects WHERE id=$1 FOR UPDATE", [objectId]);
      const blockerPid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
        .rows[0]?.pid;
      assert.ok(blockerPid);
      outcomes = Promise.allSettled(
        commands.map((command) => objects.executeObject("owner", command)),
      );
      await waitForBlockedChain(pool, blockerPid, 2);
      await blocker.query("COMMIT");
      const settled = await outcomes;
      assert.equal(settled.filter((result) => result.status === "fulfilled").length, 1);
      const rejected = settled.find((result) => result.status === "rejected");
      assert.ok(rejected?.status === "rejected");
      assert.equal(status(rejected.reason), 409);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      await outcomes;
    }
    const head = await objects.readObject("owner", { repositoryId, objectId });
    assert.equal(head.version, 2);
    assert.ok(["first", "second"].includes(head.content));
    assert.equal(
      (
        await pool.query<{ count: number }>(
          "SELECT count(*)::int count FROM app_private.object_revisions WHERE object_id=$1",
          [objectId],
        )
      ).rows[0]?.count,
      2,
    );
  });

  async function disabledTypeWins(targetTypeId: string, operation: () => Promise<unknown>) {
    const blocker = await pool.connect();
    let disabled: ReturnType<typeof objects.executeType> | undefined;
    let attempted: Promise<unknown> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM app_private.object_types WHERE id=$1 FOR UPDATE", [
        targetTypeId,
      ]);
      const blockerPid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
        .rows[0]?.pid;
      assert.ok(blockerPid);
      disabled = objects.executeType("owner", {
        action: "disable",
        repositoryId,
        requestId: randomUUID(),
        expectedVersion: 1,
        typeId: targetTypeId,
      });
      await waitForBlockedChain(pool, blockerPid, 1);
      attempted = operation();
      await waitForBlockedChain(pool, blockerPid, 2);
      await blocker.query("COMMIT");
      const result = (await disabled).result;
      assert.ok("enabled" in result);
      assert.equal(result.enabled, false);
      await assert.rejects(attempted, (error) => status(error) === 409);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      await disabled;
      await attempted?.catch(() => {});
    }
  }

  await t.test("disabling a Type serializes before new and reclassified assignments", async () => {
    const newAssignmentTypeId = randomUUID();
    await objects.executeType("owner", {
      action: "create",
      repositoryId,
      requestId: randomUUID(),
      expectedVersion: 0,
      typeId: newAssignmentTypeId,
      name: "Will disable for create",
      description: "",
    });
    const newObjectId = randomUUID();
    await disabledTypeWins(newAssignmentTypeId, () =>
      objects.executeObject("owner", {
        action: "create",
        repositoryId,
        requestId: randomUUID(),
        expectedVersion: 0,
        objectId: newObjectId,
        typeId: newAssignmentTypeId,
        name: "Must not be created",
        content: "",
      }),
    );
    assert.equal(
      (
        await pool.query<{ count: number }>(
          "SELECT count(*)::int count FROM app_private.objects WHERE id=$1",
          [newObjectId],
        )
      ).rows[0]?.count,
      0,
    );

    const reclassificationTypeId = randomUUID();
    await objects.executeType("owner", {
      action: "create",
      repositoryId,
      requestId: randomUUID(),
      expectedVersion: 0,
      typeId: reclassificationTypeId,
      name: "Will disable for reclassify",
      description: "",
    });
    const existingObjectId = randomUUID();
    await objects.executeObject("owner", {
      action: "create",
      repositoryId,
      requestId: randomUUID(),
      expectedVersion: 0,
      objectId: existingObjectId,
      typeId: primaryTypeId,
      name: "Keeps original Type",
      content: "",
    });
    await disabledTypeWins(reclassificationTypeId, () =>
      objects.executeObject("owner", {
        action: "reclassify",
        repositoryId,
        requestId: randomUUID(),
        expectedVersion: 1,
        objectId: existingObjectId,
        typeId: reclassificationTypeId,
      }),
    );
    const unchanged = await objects.readObject("owner", {
      repositoryId,
      objectId: existingObjectId,
    });
    assert.equal(unchanged.version, 1);
    assert.equal(unchanged.typeId, primaryTypeId);
  });

  await t.test("archive serializes before a new pinned-reference verification", async () => {
    const objectId = randomUUID();
    const created = await objects.executeObject("owner", {
      action: "create",
      repositoryId,
      requestId: randomUUID(),
      expectedVersion: 0,
      objectId,
      typeId: primaryTypeId,
      name: "Pin target",
      content: "",
    });
    const blocker = await pool.connect();
    let archived: ReturnType<typeof objects.executeObject> | undefined;
    let verified: Promise<unknown> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM app_private.objects WHERE id=$1 FOR UPDATE", [objectId]);
      const blockerPid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
        .rows[0]?.pid;
      assert.ok(blockerPid);
      archived = objects.executeObject("owner", {
        action: "archive",
        repositoryId,
        requestId: randomUUID(),
        expectedVersion: 1,
        objectId,
      });
      await waitForBlockedChain(pool, blockerPid, 1);
      verified = db.transaction((sql) =>
        createPostgresObjectReferenceReader(sql).verifyPinned(
          "owner",
          repositoryId,
          [{ objectId, revisionId: created.result.id }],
          { allowArchived: false },
        ),
      );
      await waitForBlockedChain(pool, blockerPid, 2);
      await blocker.query("COMMIT");
      const result = (await archived).result;
      assert.ok("archived" in result);
      assert.equal(result.archived, true);
      await assert.rejects(verified, (error) => status(error) === 409);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      blocker.release();
      await archived;
      await verified?.catch(() => {});
    }
  });

  await t.test("receipt failure rolls back Object head and immutable revision", async () => {
    const objectId = randomUUID();
    const requestId = randomUUID();
    await pool.query(`
        CREATE FUNCTION app_private.reject_test_object_command()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'forced_object_receipt_failure'; END
        $$;
        CREATE TRIGGER reject_test_object_command
        BEFORE INSERT ON app_private.object_commands
        FOR EACH ROW EXECUTE FUNCTION app_private.reject_test_object_command();
      `);
    try {
      await assert.rejects(
        objects.executeObject("owner", {
          action: "create",
          repositoryId,
          requestId,
          expectedVersion: 0,
          objectId,
          typeId: primaryTypeId,
          name: "Rollback",
          content: "must disappear",
        }),
        /forced_object_receipt_failure/,
      );
    } finally {
      await pool.query(`
          DROP TRIGGER reject_test_object_command ON app_private.object_commands;
          DROP FUNCTION app_private.reject_test_object_command();
        `);
    }
    const counts = await pool.query<{
      heads: number;
      revisions: number;
      receipts: number;
    }>(
      `SELECT
           (SELECT count(*)::int FROM app_private.objects WHERE id=$1) heads,
           (SELECT count(*)::int FROM app_private.object_revisions WHERE object_id=$1) revisions,
           (SELECT count(*)::int FROM app_private.object_commands WHERE request_id=$2) receipts`,
      [objectId, requestId],
    );
    assert.deepEqual(counts.rows, [{ heads: 0, revisions: 0, receipts: 0 }]);
  });

  await t.test("current grant revocation blocks exact retry and reads", async () => {
    await access.execute(
      "owner",
      {
        action: "grant",
        requestId: randomUUID(),
        repositoryId,
        subjectKind: "USER",
        subjectId: "member",
        capability: "write",
        expectedVersion: 0,
      },
      clock++,
    );
    const objectId = randomUUID();
    const command = {
      action: "create" as const,
      repositoryId,
      requestId: randomUUID(),
      expectedVersion: 0,
      objectId,
      typeId: primaryTypeId,
      name: "Member content",
      content: "",
    };
    await objects.executeObject("member", command);
    await access.execute(
      "owner",
      {
        action: "revoke",
        requestId: randomUUID(),
        repositoryId,
        subjectKind: "USER",
        subjectId: "member",
        expectedVersion: 1,
      },
      clock++,
    );
    await assert.rejects(
      objects.executeObject("member", command),
      (error) => status(error) === 403 || status(error) === 404,
    );
    await assert.rejects(
      objects.readObject("member", { repositoryId, objectId }),
      (error) => status(error) === 403 || status(error) === 404,
    );
    assert.equal(
      (
        await pool.query<{ count: number }>(
          "SELECT count(*)::int count FROM app_private.object_commands WHERE actor_user_id='member' AND request_id=$1",
          [command.requestId],
        )
      ).rows[0]?.count,
      1,
    );
  });
});
