import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { createTeamCollaboration } from "../src/application/collaboration.js";
import { PostgresTeamRepository } from "../src/composition/bootstrap/team.js";

const databaseUrl = process.env.CAPABILITY_TEST_DATABASE_URL;
test("PostgreSQL Team writes serialize competing versions and concurrent exact replay", {
  skip: !databaseUrl && !process.env.CI,
  timeout: 60_000,
}, async (t) => {
  assert.ok(databaseUrl, "CI must supply its disposable PostgreSQL service");
  const { pool, db, close, waitForBlocked } = await postgresSessions(databaseUrl);
  t.after(close);
  await pool.query(`INSERT INTO app_private.users(id,status,"createdAt") VALUES ('owner','active',1);
    SELECT app_private.claim_account_login('owner','USER','owner',1);
    INSERT INTO app_private.user_identities(provider,subject,user_id) VALUES('line:test','owner','owner');
    SELECT * FROM app_private.provision_organization_scope('org','owner','org','Org',2);`);
  const repository = new PostgresTeamRepository(db);
  const collaboration = createTeamCollaboration(
    () => repository,
    () => 100,
  );
  const actor = { provider: "line:test", subject: "owner" };
  const created = await collaboration.execute(actor, {
    action: "create-team",
    requestId: randomUUID(),
    organizationAccountId: "org",
    name: "Core",
    privacy: "SECRET",
    notificationSetting: "NOTIFICATIONS_DISABLED",
  });
  const first = {
    action: "rename-team",
    requestId: randomUUID(),
    organizationAccountId: "org",
    teamId: created.teamId,
    expectedVersion: 1,
    name: "One",
  };
  const second = { ...first, requestId: randomUUID(), name: "Two" };
  async function compete(commands: readonly unknown[]) {
    const blocker = await pool.connect();
    let outcomes:
      | Promise<PromiseSettledResult<Awaited<ReturnType<typeof collaboration.execute>>>[]>
      | undefined;
    try {
      await blocker.query("BEGIN; SELECT app_private.lock_governance('exclusive')");
      const pid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]
        ?.pid;
      assert.ok(pid);
      outcomes = Promise.allSettled(
        commands.map((command) => collaboration.execute(actor, command)),
      );
      const waiters = await waitForBlocked(pid, commands.length);
      assert.equal(new Set(waiters.map((row) => row.pid)).size, commands.length);
      assert.ok(waiters.every((row) => row.wait_event === "advisory"));
      await blocker.query("COMMIT");
      return await outcomes;
    } finally {
      try {
        await blocker.query("ROLLBACK");
      } finally {
        blocker.release();
      }
      await outcomes;
    }
  }
  const commands = [first, second];
  const results = await compete(commands);
  const accepted = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 1);
  const error = rejected[0]?.reason;
  assert.ok(error instanceof Error && "status" in error && error.status === 409);
  const receipt = accepted[0]?.value;
  assert.ok(receipt);
  const winner = commands[results.findIndex((result) => result.status === "fulfilled")];
  assert.ok(winner);
  assert.deepEqual(await compete([winner, winner]), [
    { status: "fulfilled", value: receipt },
    { status: "fulfilled", value: receipt },
  ]);
  assert.deepEqual(
    (await pool.query("SELECT name,version FROM app_private.teams WHERE id=$1", [created.teamId]))
      .rows,
    [{ name: winner.name, version: 2 }],
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM app_private.team_commands")).rows[0]
      ?.count,
    2,
  );
});
