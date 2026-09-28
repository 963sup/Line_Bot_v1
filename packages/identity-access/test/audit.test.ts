import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresGovernanceAuditReader } from "../src/adapters/postgres/audit.js";

test("audit reads exact authorized scope, stable pages and safe fields; revoked access fails closed", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await pg.exec(`BEGIN; SET search_path=app_private,pg_catalog;
    INSERT INTO users(id,status,"createdAt") VALUES ('owner','active',1),('outsider','active',1);
    INSERT INTO account_logins VALUES ('owner','USER','owner',1),('outsider','USER','outsider',1);
    INSERT INTO user_identities(provider,subject,user_id) VALUES ('line:test','owner','owner'),('line:test','outsider','outsider');
    INSERT INTO accounts(id,kind,created_at) VALUES ('org','ORGANIZATION',1),('other','ORGANIZATION',1);
    INSERT INTO organizations(account_id,name,status,version,created_at) VALUES ('org','Org','active',1,1),('other','Other','active',1,1);
    INSERT INTO organization_memberships VALUES ('org','owner','active',1,1);
    INSERT INTO organization_role_assignments(organization_account_id,user_id,role,status,version,user_status_version,granted_at)
      VALUES ('org','owner','OrganizationOwner','active',1,1,1);
    INSERT INTO governance_audit_events(id,actor_user_id,actor_status_version,action,scope_kind,scope_id,reason,request_id,created_at,result)
      VALUES (9007199254740992,'owner',1,'grant','organization','org','private reason','00000000-0000-4000-8000-000000000001',100,'{"status":"active","version":1,"secret":"hidden"}'),
      (9007199254740993,'owner',1,'grant','organization','org','private reason','00000000-0000-4000-8000-000000000002',100,'{"status":"active","version":2}'),
      (9007199254740994,'owner',1,'grant','organization','other','private reason','00000000-0000-4000-8000-000000000003',101,'{"status":"active","version":1}'); COMMIT;`);
  const reader = new PostgresGovernanceAuditReader(db);
  const actor = { provider: "line:test", subject: "owner" };
  const query = { scopeKind: "organization" as const, scopeId: "org", limit: 1 };
  const first = await reader.read(actor, query);
  assert.equal(first.length, 1);
  assert.equal(first[0]?.id, "9007199254740993");
  assert.equal(first[0]?.version, 2);
  assert.equal(JSON.stringify(first).includes("private reason"), false);
  assert.equal(JSON.stringify(first).includes("secret"), false);
  const second = await reader.read(actor, { ...query, before: { at: 100, id: first[0]!.id } });
  assert.equal(second[0]?.id, "9007199254740992");
  await assert.rejects(reader.read(actor, { ...query, scopeId: "other" }), { status: 403 });
  await assert.rejects(reader.read({ ...actor, subject: "outsider" }, query), { status: 403 });
  await assert.rejects(reader.read({ ...actor, subject: "unknown" }, query), { status: 403 });
  await pg.exec("UPDATE app_private.organizations SET status='inactive' WHERE account_id='org'");
  await assert.rejects(reader.read(actor, query), { status: 403 });
  await pg.exec(
    "UPDATE app_private.organizations SET status='active' WHERE account_id='org'; UPDATE app_private.organization_role_assignments SET status='revoked' WHERE organization_account_id='org'",
  );
  await assert.rejects(reader.read(actor, query), { status: 403 });
  await assert.rejects(db.transaction((sql) => sql.query("DELETE FROM governance_audit_events")));
});

test("enterprise history orders numeric IDs and rechecks affiliation and User qualification", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await pg.exec(`BEGIN; SET search_path=app_private,pg_catalog;
    INSERT INTO users(id,status,"createdAt") VALUES ('owner','active',1);
    INSERT INTO account_logins VALUES ('owner','USER','owner',1);
    INSERT INTO user_identities(provider,subject,user_id) VALUES ('line:test','owner','owner');
    INSERT INTO accounts(id,kind,created_at) VALUES ('enterprise','ENTERPRISE',1);
    INSERT INTO enterprises(account_id,status,version,created_at) VALUES ('enterprise','active',1,1);
    INSERT INTO enterprise_direct_affiliations VALUES ('enterprise','owner','active',1,1);
    INSERT INTO enterprise_role_assignments VALUES ('enterprise','owner','EnterpriseOwner','active',1,1,1);
    INSERT INTO governance_audit_events(id,actor_user_id,actor_status_version,action,scope_kind,scope_id,reason,request_id,created_at,result)
      VALUES (9,'owner',1,'grant','enterprise','enterprise','test','00000000-0000-4000-8000-000000000001',100,'{"status":"active","version":1}'),
      (10,'owner',1,'grant','enterprise','enterprise','test','00000000-0000-4000-8000-000000000002',100,'{"status":"active","version":1}'); COMMIT;`);
  const reader = new PostgresGovernanceAuditReader(db);
  const actor = { provider: "line:test", subject: "owner" };
  const query = { scopeKind: "enterprise" as const, scopeId: "enterprise", limit: 2 };
  assert.deepEqual(
    (await reader.read(actor, query)).map((row) => row.id),
    ["10", "9"],
  );
  await pg.exec(
    "UPDATE app_private.enterprise_direct_affiliations SET status='removed' WHERE user_id='owner'",
  );
  await assert.rejects(reader.read(actor, query), { status: 403 });
  await pg.exec(
    "UPDATE app_private.enterprise_direct_affiliations SET status='active' WHERE user_id='owner'; UPDATE app_private.users SET status='paused' WHERE id='owner'",
  );
  await assert.rejects(reader.read(actor, query), { status: 403 });
});
