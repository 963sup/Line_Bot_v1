import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "../src/postgres.js";
import { postgresFixture } from "../src/testing/postgres.js";

async function activeUser(db: Database, id: string) {
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt")
       VALUES($1,'active',1,1)`,
      [id],
    );
    await sql.query("SELECT app_private.claim_account_login($1,'USER',$2,1)", [id, id]);
  });
}

function postgresCode(error: unknown) {
  if (error === null || typeof error !== "object" || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

test("Project WBS Notification access follows current Project policy", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());

  for (const id of ["owner", "direct", "teammate", "outsider"]) await activeUser(db, id);
  await pg.query("SELECT * FROM app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "org",
    "owner",
    "org",
    "Organization",
    2,
  ]);

  await pg.exec(`
    BEGIN;
    INSERT INTO app_private.teams(
      id,organization_account_id,name,slug,version,created_by_user_id,created_at
    ) VALUES('team','org','Team','team',1,'owner',3);
    SELECT * FROM app_private.claim_scoped_namespace_name(
      'organization-team-slug','ORGANIZATION','org','TEAM','team','team',3
    );
    INSERT INTO app_private.team_memberships(team_id,user_id,name,status,version)
      VALUES('team','teammate','Teammate','active',1);
    INSERT INTO app_private.projects(
      id,owner_account_id,owner_account_kind,name,is_public,closed,closed_at,version
    ) VALUES
      ('project','org','ORGANIZATION','Project',true,true,3,1),
      ('personal','owner','USER','Personal',false,false,null,1);
    INSERT INTO app_private.project_user_access(
      project_id,user_id,role,version,created_at,updated_at
    ) VALUES('project','direct','WRITE',1,3,3);
    INSERT INTO app_private.project_team_access(
      project_id,team_id,role,version,created_at,updated_at
    ) VALUES('project','team','READ',1,3,3);

    INSERT INTO app_private.project_wbs(project_id,version,head_revision_id)
      VALUES('project',1,'11111111-1111-4111-8111-111111111111');
    INSERT INTO app_private.project_wbs_revisions(
      id,project_id,version,parent_revision_id,actor_user_id,action,document,at
    ) VALUES(
      '11111111-1111-4111-8111-111111111111','project',1,null,'owner','initialize',
      '{"schemaVersion":"1","nodes":[]}'::jsonb,3
    );
    INSERT INTO app_private.project_wbs_policies(
      project_id,version,minimum_approvals,allow_self_approval,actor_user_id,at
    ) VALUES('project',1,1,false,'owner',3);
    INSERT INTO app_private.project_wbs_governance(project_id,version,policy_version)
      VALUES('project',0,1);
    INSERT INTO app_private.project_wbs_proposals(
      id,project_id,number,version,author_user_id,created_at
    ) VALUES('22222222-2222-4222-8222-222222222222','project',1,1,'owner',3);
    INSERT INTO app_private.project_wbs_proposal_versions(
      project_id,proposal_id,version,title,reason,status,candidate_revision_id,
      base_baseline_id,actor_user_id,at
    ) VALUES(
      'project','22222222-2222-4222-8222-222222222222',1,'Baseline','',
      'PUBLISHED','11111111-1111-4111-8111-111111111111',null,'owner',3
    );
    INSERT INTO app_private.project_wbs_baselines(
      id,project_id,number,proposal_id,proposal_version,revision_id,
      previous_baseline_id,policy_version,published_by,approval_review_ids,at
    ) VALUES(
      '33333333-3333-4333-8333-333333333333','project',1,
      '22222222-2222-4222-8222-222222222222',1,
      '11111111-1111-4111-8111-111111111111',null,1,'owner',
      ARRAY['44444444-4444-4444-8444-444444444444']::uuid[],3
    );
    COMMIT;
  `);

  const access = async () =>
    db.transaction(
      async (sql) =>
        (
          await sql.query(
            `SELECT user_id,role FROM project_visibility_access
             WHERE project_id='project' ORDER BY user_id`,
          )
        ).rows,
    );
  assert.deepEqual(await access(), [
    { user_id: "direct", role: "WRITE" },
    { user_id: "outsider", role: "READ" },
    { user_id: "owner", role: "ADMIN" },
    { user_id: "teammate", role: "READ" },
  ]);
  assert.deepEqual(
    await db.transaction(
      async (sql) =>
        (
          await sql.query(
            "SELECT user_id,role FROM project_visibility_access WHERE project_id='personal'",
          )
        ).rows,
    ),
    [{ user_id: "owner", role: "ADMIN" }],
  );

  const insertNotification = (id: string, recipient: string, sourceVersion: string) =>
    db.transaction((sql) =>
      sql.query(
        `INSERT INTO notifications(
           id,recipient,source_type,source_id,source_version,kind,title,body,created_at,version
         ) VALUES(
           $1,$2,'project-wbs-baseline','33333333-3333-4333-8333-333333333333',
           $3,'system','Baseline','Published',4,1
         )`,
        [id, recipient, sourceVersion],
      ),
    );
  await insertNotification(
    "55555555-5555-4555-8555-555555555555",
    "outsider",
    "11111111-1111-4111-8111-111111111111",
  );
  await assert.rejects(
    insertNotification(
      "66666666-6666-4666-8666-666666666666",
      "outsider",
      "77777777-7777-4777-8777-777777777777",
    ),
    (error: unknown) => postgresCode(error) === "42501",
  );

  await pg.query("UPDATE app_private.projects SET is_public=false WHERE id='project'");
  assert.deepEqual(await access(), [
    { user_id: "direct", role: "WRITE" },
    { user_id: "owner", role: "ADMIN" },
    { user_id: "teammate", role: "READ" },
  ]);
  await assert.rejects(
    insertNotification(
      "77777777-7777-4777-8777-777777777777",
      "outsider",
      "11111111-1111-4111-8111-111111111111",
    ),
    (error: unknown) => postgresCode(error) === "42501",
  );

  await pg.query("DELETE FROM app_private.project_user_access WHERE project_id='project'");
  await pg.query("UPDATE app_private.team_memberships SET status='removed' WHERE team_id='team'");
  assert.deepEqual(await access(), [{ user_id: "owner", role: "ADMIN" }]);

  await pg.query(
    "UPDATE app_private.projects SET deleted_at=5,name='[deleted]' WHERE id='project'",
  );
  assert.deepEqual(await access(), []);
});
