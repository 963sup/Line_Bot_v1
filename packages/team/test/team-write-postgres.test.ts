import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createTeamCollaboration } from "../src/application/collaboration.js";
import { PostgresTeamRepository } from "../src/composition/bootstrap/team.js";

function hasStatus(status: number) {
  return (error: unknown) => error instanceof Error && "status" in error && error.status === status;
}

async function fixture() {
  const f = await postgresFixture();
  await f.pg.exec(`BEGIN;
    INSERT INTO app_private.users(id,status,"createdAt") VALUES ('owner','active',1),('backup','active',1),('member','active',1),('outsider','active',1);
    SELECT app_private.claim_account_login(id,'USER',id,1) FROM app_private.users;
    INSERT INTO app_private.user_identities(provider,subject,user_id) SELECT 'line:test',id,id FROM app_private.users;
    SELECT * FROM app_private.provision_organization_scope('org','owner','org','Org',2);
    INSERT INTO app_private.organization_memberships(organization_account_id,user_id,status,version,created_at) VALUES ('org','backup','active',1,3),('org','member','active',1,3);
    COMMIT;`);
  const repository = new PostgresTeamRepository(f.db);
  let at = 100;
  const collaboration = createTeamCollaboration(
    () => repository,
    () => ++at,
  );
  const request = (fields: Record<string, unknown>) => ({
    requestId: randomUUID(),
    organizationAccountId: "org",
    ...fields,
  });
  const execute = (userId: string, input: unknown) =>
    collaboration.execute({ provider: "line:test", subject: userId }, input);
  const create = (userId = "owner") =>
    execute(
      userId,
      request({
        action: "create-team",
        name: "Core",
        privacy: "SECRET",
        notificationSetting: "NOTIFICATIONS_DISABLED",
      }),
    );
  const teamVersion = async (teamId: string) =>
    (
      await f.pg.query<{ version: number }>("SELECT version FROM app_private.teams WHERE id=$1", [
        teamId,
      ])
    ).rows[0]?.version;
  const count = async () =>
    Number(
      (
        await f.pg.query<{ count: number }>(
          "SELECT count(*) AS count FROM app_private.team_commands",
        )
      ).rows[0]?.count,
    );
  const membership = async (teamId: string, userId: string) =>
    (
      await f.pg.query(
        "SELECT status,version FROM app_private.team_memberships WHERE team_id=$1 AND user_id=$2",
        [teamId, userId],
      )
    ).rows[0];
  return { ...f, request, execute, create, teamVersion, count, membership };
}

test("Team join, approval and maintainer grant preserve independent epochs, no-op membership and exact replay", async (t) => {
  const f = await fixture();
  t.after(() => f.pg.close());
  const { teamId } = await f.create();
  assert.equal(await f.teamVersion(teamId), 1);
  const join = f.request({ action: "join", teamId, expectedVersion: 0, name: "Member" });
  const joined = await f.execute("member", join);
  assert.deepEqual(await f.membership(teamId, "member"), { status: "pending", version: 1 });
  await assert.rejects(
    f.execute(
      "owner",
      f.request({
        action: "maintainer",
        teamId,
        expectedVersion: 2,
        targetUserId: "member",
        enabled: false,
      }),
    ),
    (error: unknown) =>
      hasStatus(409)(error) &&
      error instanceof Error &&
      error.message === "TeamMaintainer 對象必須是有效 Team member。",
  );
  assert.deepEqual(await f.execute("member", join), joined);
  await assert.rejects(f.execute("member", { ...join, name: "Other" }), hasStatus(409));
  assert.equal(await f.teamVersion(teamId), 2);
  await f.execute(
    "owner",
    f.request({
      action: "membership",
      teamId,
      expectedVersion: 2,
      targetUserId: "member",
      status: "active",
    }),
  );
  assert.deepEqual(await f.membership(teamId, "member"), { status: "active", version: 2 });
  await f.execute(
    "owner",
    f.request({
      action: "membership",
      teamId,
      expectedVersion: 3,
      targetUserId: "member",
      status: "active",
    }),
  );
  assert.deepEqual(await f.membership(teamId, "member"), { status: "active", version: 2 });
  assert.equal(await f.teamVersion(teamId), 4);
  const grant = f.request({
    action: "maintainer",
    teamId,
    expectedVersion: 4,
    targetUserId: "member",
    enabled: true,
  });
  const granted = await f.execute("owner", grant);
  assert.deepEqual(
    (
      await f.pg.query(
        "SELECT status,version,user_status_version,membership_version FROM app_private.team_role_assignments WHERE team_id=$1 AND user_id='member'",
        [teamId],
      )
    ).rows,
    [{ status: "active", version: 1, user_status_version: 1, membership_version: 2 }],
  );
  assert.deepEqual(await f.execute("owner", grant), granted);
  await assert.rejects(f.execute("owner", { ...grant, enabled: false }), hasStatus(409));
  await assert.rejects(
    f.execute(
      "owner",
      f.request({
        action: "maintainer",
        teamId,
        expectedVersion: 5,
        targetUserId: "member",
        enabled: true,
      }),
    ),
    hasStatus(409),
  );
  await assert.rejects(
    f.execute("member", f.request({ action: "join", teamId, expectedVersion: 0, name: "Again" })),
    hasStatus(403),
  );
  assert.equal(await f.teamVersion(teamId), 5);
  assert.equal(await f.count(), 5);
});

test("Team removal protects the last maintainer, revokes epoch-bound authority and permits exact self-removal replay", async (t) => {
  const f = await fixture();
  t.after(() => f.pg.close());
  const { teamId } = await f.create("member");
  await assert.rejects(
    f.execute(
      "member",
      f.request({
        action: "membership",
        teamId,
        expectedVersion: 1,
        targetUserId: "member",
        status: "removed",
      }),
    ),
    hasStatus(409),
  );
  assert.equal(await f.teamVersion(teamId), 1);
  assert.equal(await f.count(), 1);
  await f.execute(
    "backup",
    f.request({ action: "join", teamId, expectedVersion: 0, name: "Backup" }),
  );
  await f.execute(
    "member",
    f.request({
      action: "membership",
      teamId,
      expectedVersion: 2,
      targetUserId: "backup",
      status: "active",
    }),
  );
  await f.execute(
    "member",
    f.request({
      action: "maintainer",
      teamId,
      expectedVersion: 3,
      targetUserId: "backup",
      enabled: true,
    }),
  );
  const remove = f.request({
    action: "membership",
    teamId,
    expectedVersion: 4,
    targetUserId: "member",
    status: "removed",
  });
  const removed = await f.execute("member", remove);
  assert.deepEqual(await f.membership(teamId, "member"), { status: "removed", version: 2 });
  assert.deepEqual(
    (
      await f.pg.query(
        "SELECT status,version,membership_version FROM app_private.team_role_assignments WHERE team_id=$1 AND user_id='member'",
        [teamId],
      )
    ).rows,
    [{ status: "revoked", version: 2, membership_version: 1 }],
  );
  assert.deepEqual(await f.execute("member", remove), removed);
  assert.equal(await f.teamVersion(teamId), 5);
  assert.equal(await f.count(), 5);
  await assert.rejects(
    f.execute(
      "backup",
      f.request({
        action: "membership",
        teamId,
        expectedVersion: 5,
        targetUserId: "member",
        status: "active",
      }),
    ),
    hasStatus(404),
  );
  await assert.rejects(
    f.execute("member", f.request({ action: "join", teamId, expectedVersion: 0, name: "Again" })),
    hasStatus(403),
  );
  await assert.rejects(
    f.execute(
      "member",
      f.request({ action: "rename-team", teamId, expectedVersion: 5, name: "Denied" }),
    ),
    hasStatus(403),
  );
  assert.equal(await f.teamVersion(teamId), 5);
  assert.equal(await f.count(), 5);
});

test("Team exact replay rechecks current User and Organization qualification before durable evidence", async (t) => {
  const f = await fixture();
  t.after(() => f.pg.close());
  const { teamId } = await f.create("member");
  const rename = f.request({ action: "rename-team", teamId, expectedVersion: 1, name: "Renamed" });
  await f.execute("member", rename);
  await f.pg.exec(
    "UPDATE app_private.users SET status='suspended',status_version=status_version+1 WHERE id='member'",
  );
  await assert.rejects(f.execute("member", rename), hasStatus(403));
  assert.deepEqual(
    (await f.pg.query("SELECT name,version FROM app_private.teams WHERE id=$1", [teamId])).rows,
    [{ name: "Renamed", version: 2 }],
  );
  assert.equal(await f.count(), 2);
});

test("Team receipt failure rolls back membership and aggregate version and leaves the request retryable", async (t) => {
  const f = await fixture();
  t.after(() => f.pg.close());
  const { teamId } = await f.create();
  await f.execute(
    "member",
    f.request({ action: "join", teamId, expectedVersion: 0, name: "Member" }),
  );
  await f.pg.exec(`CREATE FUNCTION app_private.fail_team_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'team-receipt-unavailable'; END $$;
    CREATE TRIGGER fail_team_receipt BEFORE INSERT ON app_private.team_commands FOR EACH ROW EXECUTE FUNCTION app_private.fail_team_receipt();`);
  const approve = f.request({
    action: "membership",
    teamId,
    expectedVersion: 2,
    targetUserId: "member",
    status: "active",
  });
  await assert.rejects(f.execute("owner", approve), /team-receipt-unavailable/);
  assert.deepEqual(await f.membership(teamId, "member"), { status: "pending", version: 1 });
  assert.equal(await f.teamVersion(teamId), 2);
  assert.equal(await f.count(), 2);
  await f.pg.exec("DROP TRIGGER fail_team_receipt ON app_private.team_commands");
  await f.execute("owner", approve);
  assert.deepEqual(await f.membership(teamId, "member"), { status: "active", version: 2 });
  assert.equal(await f.teamVersion(teamId), 3);
  assert.equal(await f.count(), 3);
});

test("typed Postgres execute preserves raw command values without reparsing", async (t) => {
  const f = await fixture();
  t.after(() => f.pg.close());
  const repository = new PostgresTeamRepository(f.db);
  const result = await repository.execute(
    { provider: "line:test", subject: "owner" },
    {
      action: "create-team",
      requestId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      organizationAccountId: "org",
      name: " Core ",
      privacy: "SECRET",
      notificationSetting: "NOTIFICATIONS_DISABLED",
    },
    100,
  );
  assert.deepEqual(
    (
      await f.pg.query("SELECT name,slug,version FROM app_private.teams WHERE id=$1", [
        result.teamId,
      ])
    ).rows,
    [{ name: " Core ", slug: "core", version: 1 }],
  );
});

test("stale active TeamMaintainer stays ineffective until regrant binds current epochs", async (t) => {
  const f = await fixture();
  t.after(() => f.pg.close());
  const { teamId } = await f.create();
  await f.execute(
    "member",
    f.request({ action: "join", teamId, expectedVersion: 0, name: "Member" }),
  );
  await f.execute(
    "owner",
    f.request({
      action: "membership",
      teamId,
      expectedVersion: 2,
      targetUserId: "member",
      status: "active",
    }),
  );
  await f.pg.query(
    "INSERT INTO app_private.team_role_assignments(team_id,user_id,role,status,version,user_status_version,membership_version,granted_at) VALUES($1,'member','TeamMaintainer','active',2,1,1,50)",
    [teamId],
  );
  const staleView = await new PostgresTeamRepository(f.db).view(
    { provider: "line:test", subject: "owner" },
    "org",
    teamId,
  );
  assert.equal(staleView.members.find((member) => member.userId === "member")?.isMaintainer, false);
  await f.execute(
    "owner",
    f.request({
      action: "maintainer",
      teamId,
      expectedVersion: 3,
      targetUserId: "member",
      enabled: true,
    }),
  );
  assert.deepEqual(
    (
      await f.pg.query(
        "SELECT status,version,user_status_version,membership_version FROM app_private.team_role_assignments WHERE team_id=$1 AND user_id='member'",
        [teamId],
      )
    ).rows,
    [{ status: "active", version: 3, user_status_version: 1, membership_version: 2 }],
  );
});

test("TeamMaintainer grant denies missing Organization participation without assignment write", async (t) => {
  const f = await fixture();
  t.after(() => f.pg.close());
  const { teamId } = await f.create();
  await f.pg.query(
    "INSERT INTO app_private.team_memberships(team_id,user_id,name,status,version) VALUES($1,'outsider','Outsider','active',1)",
    [teamId],
  );
  await assert.rejects(
    f.execute(
      "owner",
      f.request({
        action: "maintainer",
        teamId,
        expectedVersion: 1,
        targetUserId: "outsider",
        enabled: true,
      }),
    ),
    hasStatus(403),
  );
  assert.deepEqual(
    (
      await f.pg.query(
        "SELECT status,version FROM app_private.team_role_assignments WHERE team_id=$1 AND user_id='outsider'",
        [teamId],
      )
    ).rows,
    [],
  );
  assert.equal(await f.teamVersion(teamId), 1);
});
