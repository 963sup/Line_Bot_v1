import assert from "node:assert/strict";
import test from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresEnterpriseGovernance } from "../src/adapters/postgres.js";

test("Enterprise owner reads outside Repository collaborators from the derived Repository projection", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  await pg.exec(`
    BEGIN;
    INSERT INTO app_private.users(id,status,"createdAt")
      VALUES ('owner','active',1),('outside','active',1);
    SELECT app_private.claim_account_login(id,'USER',id,1) FROM app_private.users;
    INSERT INTO app_private.user_identities(provider,subject,user_id)
      VALUES ('line:test','enterprise-owner','owner');
    SELECT * FROM app_private.provision_organization_scope('org','owner','org','Org',2);
    SELECT * FROM app_private.provision_enterprise_scope('enterprise','owner','enterprise','Enterprise',3);
    INSERT INTO app_private.enterprise_organizations(
      enterprise_account_id,organization_account_id,status,version,attached_at
    ) VALUES ('enterprise','org','active',1,4);
    INSERT INTO app_private.repositories(
      id,owner_account_id,owner_account_kind,name,visibility,version
    ) VALUES ('repo','org','ORGANIZATION','Repository','private',1);
    INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version)
      VALUES ('repo','outside','triage',1);
    COMMIT;
  `);

  const governance = new PostgresEnterpriseGovernance(db);
  const actor = { provider: "line:test", subject: "enterprise-owner" };

  const outside = await governance.detail(actor, "enterprise");
  assert.deepEqual(outside.outsideRepositoryCollaborators, [
    {
      organizationAccountId: "org",
      repositoryId: "repo",
      userId: "outside",
      capability: "triage",
      grantVersion: 1,
    },
  ]);

  await pg.query(
    "insert into app_private.organization_memberships(organization_account_id,user_id,status,version,created_at) values('org','outside','active',1,5)",
  );
  const member = await governance.detail(actor, "enterprise");
  assert.deepEqual(member.outsideRepositoryCollaborators, []);

  await pg.query(
    "update app_private.organization_memberships set status='removed',version=version+1 where organization_account_id='org' and user_id='outside'",
  );
  const outsideAgain = await governance.detail(actor, "enterprise");
  assert.equal(outsideAgain.outsideRepositoryCollaborators.length, 1);

  await pg.query(
    "delete from app_private.repository_access where repository_id='repo' and principal_id='outside'",
  );
  const revoked = await governance.detail(actor, "enterprise");
  assert.deepEqual(revoked.outsideRepositoryCollaborators, []);
});
