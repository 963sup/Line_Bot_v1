import assert from "node:assert/strict";
import test from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresTeamRepository } from "../src/adapters/postgres.js";
import { TeamError } from "../src/domain/errors/team-error.js";

test("Team hierarchy derives membership and Repository access without copying membership truth", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await db.transaction(async (sql) => {
    for (const id of ["owner", "child-user", "viewer"]) {
      await sql.query('insert into users(id,status,"createdAt") values($1,$2,$3)', [
        id,
        "active",
        1,
      ]);
      await sql.query("select app_private.claim_account_login($1,'USER',$2,1)", [id, id]);
      await sql.query(
        "insert into user_identities(provider,subject,user_id) values('line:test',$1,$2)",
        [id, id],
      );
    }
  });
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "organization-team",
    "owner",
    "team-org",
    "Team Org",
    2,
  ]);
  for (const userId of ["child-user", "viewer"]) {
    await pg.query(
      "insert into app_private.organization_memberships(organization_account_id,user_id,status,version,created_at) values($1,$2,'active',1,3)",
      ["organization-team", userId],
    );
  }

  const store = new PostgresTeamRepository(db);
  const owner = { provider: "line:test", subject: "owner" };
  const parent = await store.execute(
    owner,
    {
      action: "create-team",
      requestId: "11111111-1111-4111-8111-111111111111",
      organizationAccountId: "organization-team",
      name: "Parent",
      privacy: "VISIBLE",
      notificationSetting: "NOTIFICATIONS_DISABLED",
    },
    10,
  );
  const child = await store.execute(
    owner,
    {
      action: "create-team",
      requestId: "22222222-2222-4222-8222-222222222222",
      organizationAccountId: "organization-team",
      name: "Child",
      privacy: "SECRET",
      notificationSetting: "NOTIFICATIONS_DISABLED",
    },
    11,
  );

  await store.execute(
    owner,
    {
      action: "parent-team",
      requestId: "33333333-3333-4333-8333-333333333333",
      organizationAccountId: "organization-team",
      teamId: child.teamId,
      expectedVersion: 1,
      parentTeamId: parent.teamId,
    },
    12,
  );
  await pg.query(
    "insert into app_private.team_memberships(team_id,user_id,name,status,version) values($1,$2,$3,'active',1)",
    [child.teamId, "child-user", "Child User"],
  );

  const childActor = { provider: "line:test", subject: "child-user" };
  const parentView = await store.view(childActor, "organization-team", parent.teamId);
  assert.equal(parentView.team?.membershipStatus, "active");
  assert.equal(parentView.team?.membershipType, "CHILD_TEAM");
  assert.equal(parentView.team?.privacy, "VISIBLE");
  assert.equal(
    parentView.members.find((member) => member.userId === "child-user")?.sourceTeamId,
    child.teamId,
  );

  const membershipSources = await pg.query(
    `select team_id,user_id,membership_type,source_team_id,depth
     from app_private.team_effective_memberships
     where team_id=$1 and user_id='child-user'
     order by depth,source_team_id`,
    [parent.teamId],
  );
  assert.deepEqual(membershipSources.rows, [
    {
      team_id: parent.teamId,
      user_id: "child-user",
      membership_type: "CHILD_TEAM",
      source_team_id: child.teamId,
      depth: 1,
    },
  ]);

  await assert.rejects(
    store.view({ provider: "line:test", subject: "viewer" }, "organization-team", child.teamId),
    (error: unknown) => error instanceof TeamError && error.status === 404,
  );

  await pg.query(
    "insert into app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version) values('repository-team','organization-team','ORGANIZATION','Team Repo','private',1)",
  );
  await pg.query(
    "insert into app_private.repository_team_access(repository_id,organization_id,team_id,capability,version) values('repository-team','organization-team',$1,'read',1),('repository-team','organization-team',$2,'triage',1)",
    [parent.teamId, child.teamId],
  );

  const accessSources = await pg.query(
    `select grant_team_id,source_team_id,membership_type,permission
     from app_private.repository_team_effective_access_sources
     where repository_id='repository-team' and user_id='child-user'
     order by permission,grant_team_id`,
  );
  assert.deepEqual(accessSources.rows, [
    {
      grant_team_id: parent.teamId,
      source_team_id: child.teamId,
      membership_type: "CHILD_TEAM",
      permission: "read",
    },
    {
      grant_team_id: child.teamId,
      source_team_id: child.teamId,
      membership_type: "IMMEDIATE",
      permission: "triage",
    },
  ]);
  const beforeUnlink = await pg.query(
    "select permissions from app_private.repository_effective_access where repository_id='repository-team' and user_id='child-user'",
  );
  assert.deepEqual(beforeUnlink.rows, [{ permissions: ["read", "triage"] }]);

  await assert.rejects(
    store.execute(
      owner,
      {
        action: "parent-team",
        requestId: "44444444-4444-4444-8444-444444444444",
        organizationAccountId: "organization-team",
        teamId: parent.teamId,
        expectedVersion: 1,
        parentTeamId: child.teamId,
      },
      13,
    ),
    (error: unknown) => error instanceof TeamError && error.status === 409,
  );

  await store.execute(
    owner,
    {
      action: "parent-team",
      requestId: "55555555-5555-4555-8555-555555555555",
      organizationAccountId: "organization-team",
      teamId: child.teamId,
      expectedVersion: 2,
      parentTeamId: null,
    },
    14,
  );
  const afterUnlink = await pg.query(
    "select permissions from app_private.repository_effective_access where repository_id='repository-team' and user_id='child-user'",
  );
  assert.deepEqual(afterUnlink.rows, [{ permissions: ["triage"] }]);

  await store.execute(
    owner,
    {
      action: "settings",
      requestId: "66666666-6666-4666-8666-666666666666",
      organizationAccountId: "organization-team",
      teamId: child.teamId,
      expectedVersion: 3,
      privacy: "VISIBLE",
      notificationSetting: "NOTIFICATIONS_ENABLED",
    },
    15,
  );
  const viewerView = await store.view(
    { provider: "line:test", subject: "viewer" },
    "organization-team",
    child.teamId,
  );
  assert.equal(viewerView.team?.membershipStatus, "none");
  assert.equal(viewerView.team?.privacy, "VISIBLE");
  assert.equal(viewerView.team?.notificationSetting, "NOTIFICATIONS_ENABLED");
  assert.equal(
    viewerView.members.some((member) => member.userId === "child-user"),
    true,
  );
});
