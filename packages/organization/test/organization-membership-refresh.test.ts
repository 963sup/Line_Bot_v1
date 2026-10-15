import assert from "node:assert/strict";
import test from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { refreshOrganizationMembershipFromSources } from "../src/postgres.js";

async function fixture() {
  const f = await postgresFixture();
  await f.pg.exec(`
    INSERT INTO app_private.users(id,status,"createdAt") VALUES ('owner','active',1),('member','active',1);
    SELECT app_private.claim_account_login(id,'USER',id,1) FROM app_private.users;
    SELECT * FROM app_private.provision_organization_scope('org','owner','org','Org',2);
  `);
  return f;
}

test("membership refresh returns one current row for creation, removal, reactivation and unchanged states", async (t) => {
  const { pg } = await fixture();
  t.after(() => pg.close());
  const refresh = async () =>
    (
      await pg.query(
        "SELECT * FROM app_private.refresh_organization_membership('org','member',100)",
      )
    ).rows;
  assert.deepEqual(await refresh(), []);
  await pg.exec(`INSERT INTO app_private.organization_direct_memberships(
    organization_account_id,user_id,status,version,created_at
  ) VALUES('org','member','active',1,3)`);
  assert.deepEqual(await refresh(), [{ membership_status: "active", membership_version: 1 }]);
  assert.deepEqual(await refresh(), [{ membership_status: "active", membership_version: 1 }]);
  await pg.exec(
    "UPDATE app_private.organization_direct_memberships SET status='removed',version=2 WHERE user_id='member'",
  );
  assert.deepEqual(await refresh(), [{ membership_status: "removed", membership_version: 2 }]);
  assert.deepEqual(await refresh(), [{ membership_status: "removed", membership_version: 2 }]);
  await pg.exec(
    "UPDATE app_private.organization_direct_memberships SET status='active',version=3 WHERE user_id='member'",
  );
  assert.deepEqual(await refresh(), [{ membership_status: "active", membership_version: 3 }]);
  assert.deepEqual(await refresh(), [{ membership_status: "active", membership_version: 3 }]);
});

test("the runtime membership coordinator commits or rolls back its source and does not restore removed Owner authority", async (t) => {
  const { pg, db } = await fixture();
  t.after(() => pg.close());
  const addSource = async (rollback: boolean) =>
    db.transaction(async (sql) => {
      await sql.query(`INSERT INTO organization_direct_memberships(
        organization_account_id,user_id,status,version,created_at
      ) VALUES('org','member','active',1,3)`);
      const result = await refreshOrganizationMembershipFromSources(sql, "org", "member", 100);
      assert.deepEqual(result, { membership_status: "active", membership_version: 1 });
      if (rollback) throw new Error("rollback after refresh");
      return result;
    });
  await assert.rejects(addSource(true), /rollback after refresh/);
  assert.deepEqual(
    (await pg.query("SELECT * FROM app_private.organization_memberships WHERE user_id='member'"))
      .rows,
    [],
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT * FROM app_private.organization_direct_memberships WHERE user_id='member'",
      )
    ).rows,
    [],
  );
  await addSource(false);
  await pg.exec(`INSERT INTO app_private.organization_role_assignments(
    organization_account_id,user_id,role,status,version,user_status_version,membership_version,granted_at
  ) VALUES('org','member','OrganizationOwner','active',1,1,1,100)`);
  const remove = await db.transaction(async (sql) => {
    await sql.query(
      "UPDATE organization_direct_memberships SET status='removed',version=2 WHERE user_id='member'",
    );
    return refreshOrganizationMembershipFromSources(sql, "org", "member", 101);
  });
  assert.deepEqual(remove, { membership_status: "removed", membership_version: 2 });
  const restored = await db.transaction(async (sql) => {
    await sql.query(
      "UPDATE organization_direct_memberships SET status='active',version=3 WHERE user_id='member'",
    );
    return refreshOrganizationMembershipFromSources(sql, "org", "member", 102);
  });
  assert.deepEqual(restored, { membership_status: "active", membership_version: 3 });
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version,membership_version FROM app_private.organization_role_assignments WHERE user_id='member'",
      )
    ).rows,
    [{ status: "revoked", version: 2, membership_version: 1 }],
  );
});
