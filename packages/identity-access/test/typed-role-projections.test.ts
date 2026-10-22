import assert from "node:assert/strict";
import test from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import {
  hasEnterpriseOwnerAssignment,
  hasOrganizationOwnerAssignment,
  isOrganizationOwner,
  requireEnterpriseLifecycleOwner,
  requireEnterpriseOwner,
  requireOrganizationOwner,
} from "../src/postgres/typed-role-assignments.js";

test("Enterprise owner projection preserves direct qualification, epochs, and lifecycle recovery", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await pg.exec(`BEGIN; SET search_path=app_private,pg_catalog;
    INSERT INTO users(id,status,"createdAt") VALUES ('owner','active',1),('indirect','active',1);
    SELECT app_private.claim_account_login(id,'USER',id,1)
    FROM (VALUES ('owner'),('indirect')) AS fixture(id);
    SELECT * FROM app_private.provision_enterprise_scope(
      'enterprise','owner','enterprise','Enterprise',1
    );
    INSERT INTO enterprise_role_assignments VALUES
      ('enterprise','indirect','EnterpriseOwner','active',1,1,1);
    COMMIT;`);

  await db.transaction(async (sql) => {
    assert.deepEqual(
      (
        await sql.query(
          "SELECT owner_assignment_qualified FROM identity_access_enterprise_subjects WHERE enterprise_account_id='enterprise' AND user_id='owner'",
        )
      ).rows,
      [{ owner_assignment_qualified: true }],
    );
    assert.equal(await hasEnterpriseOwnerAssignment(sql, "enterprise", "owner"), true);
    assert.equal(await hasEnterpriseOwnerAssignment(sql, "enterprise", "indirect"), false);
    await requireEnterpriseOwner(sql, "enterprise", "owner");
  });

  await pg.exec(
    "UPDATE app_private.enterprises SET status='inactive' WHERE account_id='enterprise'",
  );
  await db.transaction(async (sql) => {
    assert.equal(await hasEnterpriseOwnerAssignment(sql, "enterprise", "owner"), true);
    await requireEnterpriseLifecycleOwner(sql, "enterprise", "owner");
    await assert.rejects(requireEnterpriseOwner(sql, "enterprise", "owner"), { status: 403 });
  });

  await pg.exec(`UPDATE app_private.enterprises SET status='active' WHERE account_id='enterprise';
    UPDATE app_private.enterprise_role_assignments SET status='revoked' WHERE user_id='owner';`);
  await db.transaction(async (sql) => {
    assert.equal(await hasEnterpriseOwnerAssignment(sql, "enterprise", "owner"), false);
  });

  await pg.exec(`UPDATE app_private.enterprise_role_assignments SET status='active' WHERE user_id='owner';
    UPDATE app_private.users SET status='paused' WHERE id='owner';`);
  await db.transaction(async (sql) => {
    assert.equal(await hasEnterpriseOwnerAssignment(sql, "enterprise", "owner"), false);
  });
  await pg.exec("UPDATE app_private.users SET status='active' WHERE id='owner'");
  await db.transaction(async (sql) => {
    assert.equal(await hasEnterpriseOwnerAssignment(sql, "enterprise", "owner"), false);
  });
  await pg.exec(
    "UPDATE app_private.enterprise_role_assignments SET user_status_version=3 WHERE user_id='owner'",
  );
  await db.transaction(async (sql) => {
    assert.equal(await hasEnterpriseOwnerAssignment(sql, "enterprise", "owner"), true);
  });

  await pg.exec(
    "UPDATE app_private.enterprise_direct_affiliations SET status='removed' WHERE user_id='owner'",
  );
  await db.transaction(async (sql) => {
    assert.equal(await hasEnterpriseOwnerAssignment(sql, "enterprise", "owner"), false);
  });
});

test("Organization owner projection preserves membership epochs, active scope, and rollback", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await pg.exec(`BEGIN; SET search_path=app_private,pg_catalog;
    INSERT INTO users(id,status,"createdAt") VALUES ('owner','active',1);
    SELECT app_private.claim_account_login('owner','USER','owner',1);
    INSERT INTO accounts(id,kind,created_at) VALUES ('organization','ORGANIZATION',1);
    INSERT INTO organizations(account_id,name,status,version,created_at)
      VALUES ('organization','Organization','active',1,1);
    INSERT INTO organization_memberships VALUES ('organization','owner','active',1,1);
    INSERT INTO organization_role_assignments(
      organization_account_id,user_id,role,status,version,user_status_version,granted_at,membership_version
    ) VALUES ('organization','owner','OrganizationOwner','active',1,1,1,1);
    COMMIT;`);

  await db.transaction(async (sql) => {
    assert.deepEqual(
      (
        await sql.query(
          "SELECT owner_assignment_qualified FROM identity_access_organization_subjects WHERE organization_account_id='organization' AND user_id='owner'",
        )
      ).rows,
      [{ owner_assignment_qualified: true }],
    );
    assert.equal(await hasOrganizationOwnerAssignment(sql, "organization", "owner"), true);
    assert.equal(await isOrganizationOwner(sql, "organization", "owner"), true);
  });
  await pg.exec(
    "UPDATE app_private.organizations SET status='inactive' WHERE account_id='organization'",
  );
  await db.transaction(async (sql) => {
    assert.equal(await hasOrganizationOwnerAssignment(sql, "organization", "owner"), true);
    assert.equal(await isOrganizationOwner(sql, "organization", "owner"), false);
    await assert.rejects(requireOrganizationOwner(sql, "organization", "owner"), { status: 403 });
  });

  await pg.exec(`UPDATE app_private.organizations SET status='active' WHERE account_id='organization';
    UPDATE app_private.organization_role_assignments SET status='revoked' WHERE user_id='owner';`);
  await db.transaction(async (sql) => {
    assert.equal(await hasOrganizationOwnerAssignment(sql, "organization", "owner"), false);
  });
  await pg.exec(`UPDATE app_private.organization_role_assignments SET status='active' WHERE user_id='owner';
    UPDATE app_private.users SET status='paused' WHERE id='owner';`);
  await db.transaction(async (sql) => {
    assert.equal(await hasOrganizationOwnerAssignment(sql, "organization", "owner"), false);
  });
  await pg.exec(`UPDATE app_private.users SET status='active' WHERE id='owner';
    UPDATE app_private.organization_role_assignments SET user_status_version=3 WHERE user_id='owner';
    UPDATE app_private.organization_memberships SET status='removed',version=2 WHERE user_id='owner';`);
  await db.transaction(async (sql) => {
    assert.equal(await hasOrganizationOwnerAssignment(sql, "organization", "owner"), false);
  });
  await pg.exec(
    "UPDATE app_private.organization_memberships SET status='active',version=3 WHERE user_id='owner'",
  );
  await db.transaction(async (sql) => {
    assert.equal(await hasOrganizationOwnerAssignment(sql, "organization", "owner"), false);
  });
  await pg.exec(
    "UPDATE app_private.organization_role_assignments SET membership_version=3 WHERE user_id='owner'",
  );
  await db.transaction(async (sql) => {
    assert.equal(await hasOrganizationOwnerAssignment(sql, "organization", "owner"), true);
  });

  await assert.rejects(
    db.transaction(async (sql) => {
      await sql.query(
        "UPDATE organization_role_assignments SET status='revoked' WHERE user_id='owner'",
      );
      assert.equal(await hasOrganizationOwnerAssignment(sql, "organization", "owner"), false);
      throw new Error("rollback");
    }),
    /rollback/,
  );
  await db.transaction(async (sql) => {
    assert.equal(await hasOrganizationOwnerAssignment(sql, "organization", "owner"), true);
  });
});
