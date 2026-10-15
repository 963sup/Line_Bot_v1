import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PostgresUserStore } from "@line_bot_v1/account/postgres";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { PostgresRepositoryAccessStore } from "@line_bot_v1/repository/postgres/access-management";
import { PostgresAttendanceStore } from "../src/adapters/outbound/persistence/postgres-attendance-store.js";
import { AttendanceError } from "../src/domain/error.js";

const databaseUrl = process.env.CAPABILITY_TEST_DATABASE_URL;
const options = { skip: !databaseUrl && !process.env.CI, timeout: 60_000 };
const now = Date.parse("2026-10-15T08:00:00+08:00");
const recipient = { provider: "line:test", subject: `U${"1".repeat(32)}` };
const noEffects = { sessions: 0, events: 0, receipts: 0, notifications: 0, credits: 0 };
const clockInEffects = { sessions: 1, events: 1, receipts: 1, notifications: 1, credits: 1 };
const command = (expectedVersion: number) => ({
  requestId: randomUUID(),
  expectedVersion,
  location: { latitude: 25, longitude: 121, accuracy: 5 },
});
const revoke = () => ({
  action: "revoke" as const,
  requestId: randomUUID(),
  repositoryId: "repo",
  subjectKind: "USER" as const,
  subjectId: "member",
  expectedVersion: 1,
});

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  if (!resolve) throw new Error("Promise executor did not initialize synchronously");
  return { promise, resolve };
}

// Run the actual adapter callback, then hold its transaction before commit/rollback.
function heldTransaction(db: Database, rollback = false) {
  const entered = deferred<number>(),
    release = deferred<void>();
  const abort = new Error("controlled transaction rollback");
  const held: Database = {
    transaction: (work) =>
      db.transaction(async (sql) => {
        const pid = (await sql.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid;
        assert.equal(typeof pid, "number");
        const result = await work(sql);
        entered.resolve(Number(pid));
        await release.promise;
        if (rollback) throw abort;
        return result;
      }),
  };
  return { db: held, entered: entered.promise, release: () => release.resolve(), abort };
}

async function createFixture() {
  assert.ok(databaseUrl, "CI must supply its disposable PostgreSQL service");
  const fixture = await postgresSessions(databaseUrl);
  try {
    await fixture.db.transaction(async (sql) => {
      await sql.query(`INSERT INTO users(id,status,status_version,"createdAt")
        VALUES('owner','active',1,1),('member','active',1,1)`);
      await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
      await sql.query(
        "INSERT INTO user_identities(provider,subject,user_id) VALUES($1,$2,'member')",
        [recipient.provider, recipient.subject],
      );
    });
    await fixture.pool.query(
      "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Repo','private')",
    );
    await fixture.pool.query("UPDATE app_private.repositories SET address=$1 WHERE id='repo'", [
      JSON.stringify({ address: "Test", latitude: 25, longitude: 121, radius: 100 }),
    ]);
    await new PostgresRepositoryAccessStore(fixture.db).execute(
      "owner",
      {
        action: "grant",
        requestId: randomUUID(),
        repositoryId: "repo",
        subjectKind: "USER",
        subjectId: "member",
        capability: "read",
        expectedVersion: 0,
      },
      now,
    );
    return fixture;
  } catch (error) {
    await fixture.close();
    throw error;
  }
}

async function effects(fixture: Awaited<ReturnType<typeof createFixture>>) {
  const { rows } = await fixture.pool.query(`SELECT
    (SELECT count(*)::int FROM app_private.attendance_sessions) AS sessions,
    (SELECT count(*)::int FROM app_private.attendance_events) AS events,
    (SELECT count(*)::int FROM app_private.attendance_commands) AS receipts,
    (SELECT count(*)::int FROM app_private.attendance_notification_outbox) AS notifications,
    (SELECT count(*)::int FROM app_private.asset_ledger_entries WHERE member_id='member') AS credits`);
  return rows[0];
}

for (const [change, rollback] of [
  ["access", false],
  ["access", true],
  ["qualification", false],
] as const) {
  test(
    `PostgreSQL ${change} revoke ${rollback ? "rollback restores" : "commit removes"} Attendance eligibility after observable shared waiting`,
    options,
    async (t) => {
      const fixture = await createFixture();
      t.after(fixture.close);
      const held = heldTransaction(fixture.db, rollback);
      // This fixture has no permission administrators. The SQL lifecycle guard still runs.
      assert.equal(
        (
          await fixture.pool.query(
            "SELECT count(*)::int AS count FROM app_private.permission_administrators",
          )
        ).rows[0]?.count,
        0,
      );
      const mutation =
        change === "access"
          ? new PostgresRepositoryAccessStore(held.db).execute("owner", revoke(), now)
          : new PostgresUserStore(held.db, { async protectPermissionAdministrator() {} }).suspend(
              "member",
            );
      const writer = mutation.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      let reader: Promise<unknown> | undefined;
      try {
        const pid = await Promise.race([held.entered, writer]);
        assert.equal(typeof pid, "number", "writer must reach the real transaction barrier");
        const store = new PostgresAttendanceStore(fixture.db);
        const start = command(0);
        const pending = store.execute("member", "clockIn", start, now, recipient).then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
        reader = pending;
        const waiting = await fixture.waitForBlocked(Number(pid));
        assert.notEqual(waiting[0]?.pid, pid);
        assert.equal(waiting[0]?.wait_event, "advisory");
        assert.deepEqual(await effects(fixture), noEffects);
        held.release();
        const written = await writer,
          read = await pending;
        if (rollback) {
          assert.ok("error" in written && written.error === held.abort);
          assert.ok("value" in read);
          assert.equal(read.value.version, 1);
          assert.deepEqual(await effects(fixture), clockInEffects);
          assert.equal(
            (
              await fixture.pool.query(
                "SELECT count(*)::int AS count FROM app_private.repository_commands",
              )
            ).rows[0]?.count,
            1,
          );
          // Current Repository access can disappear after clock-in; the immutable point still permits clock-out.
          await new PostgresRepositoryAccessStore(fixture.db).execute("owner", revoke(), now + 1);
          assert.equal(
            (await store.execute("member", "clockIn", start, now + 2, recipient)).replayed,
            true,
          );
          await assert.rejects(
            store.execute(
              "member",
              "clockIn",
              { ...start, expectedVersion: 1 },
              now + 3,
              recipient,
            ),
            (error) => error instanceof AttendanceError && error.status === 409,
          );
          assert.deepEqual(await effects(fixture), clockInEffects);
          const ended = await store.execute(
            "member",
            "clockOut",
            command(1),
            now + 3_600_000,
            recipient,
          );
          assert.equal(ended.attendance.active, null);
          assert.equal(ended.attendance.records[0]?.endedAt, now + 3_600_000);
          assert.deepEqual(await effects(fixture), {
            sessions: 1,
            events: 2,
            receipts: 2,
            notifications: 2,
            credits: 2,
          });
        } else {
          assert.ok("value" in written);
          assert.ok("error" in read && read.error instanceof AttendanceError);
          assert.equal(read.error.status, 403);
          assert.deepEqual(await effects(fixture), noEffects);
          assert.equal(
            (
              await fixture.pool.query(
                "SELECT count(*)::int AS count FROM app_private.attendance_state",
              )
            ).rows[0]?.count,
            0,
          );
          assert.equal(
            (
              await fixture.pool.query(
                "SELECT count(*)::int AS count FROM app_private.repository_commands",
              )
            ).rows[0]?.count,
            change === "access" ? 2 : 1,
          );
          if (change === "qualification") {
            assert.deepEqual(
              (
                await fixture.pool.query(
                  "SELECT status,status_version FROM app_private.users WHERE id='member'",
                )
              ).rows,
              [{ status: "suspended", status_version: 2 }],
            );
          }
        }
      } finally {
        held.release();
        await Promise.allSettled([writer, ...(reader ? [reader] : [])]);
      }
    },
  );
}

test(
  "PostgreSQL shared Attendance command blocks exclusive access revoke until its atomic commit",
  options,
  async (t) => {
    const fixture = await createFixture();
    t.after(fixture.close);
    const held = heldTransaction(fixture.db);
    const clock = new PostgresAttendanceStore(held.db)
      .execute("member", "clockIn", command(0), now, recipient)
      .then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
    let writer: Promise<unknown> | undefined;
    try {
      const pid = await Promise.race([held.entered, clock]);
      assert.equal(typeof pid, "number");
      const pending = new PostgresRepositoryAccessStore(fixture.db).execute(
        "owner",
        revoke(),
        now + 1,
      );
      writer = pending;
      const waiting = await fixture.waitForBlocked(Number(pid));
      assert.notEqual(waiting[0]?.pid, pid);
      assert.equal(waiting[0]?.wait_event, "advisory");
      assert.deepEqual(await effects(fixture), noEffects);
      held.release();
      assert.ok("value" in (await clock));
      await pending;
      assert.deepEqual(await effects(fixture), clockInEffects);
      assert.equal(
        (
          await fixture.pool.query(
            "SELECT count(*)::int AS count FROM app_private.repository_access WHERE principal_id='member'",
          )
        ).rows[0]?.count,
        0,
      );
      assert.equal(
        (
          await fixture.pool.query(
            "SELECT count(*)::int AS count FROM app_private.repository_commands",
          )
        ).rows[0]?.count,
        2,
      );
    } finally {
      held.release();
      await Promise.allSettled([clock, ...(writer ? [writer] : [])]);
    }
  },
);
