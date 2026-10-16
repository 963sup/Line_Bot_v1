import assert from "node:assert/strict";
import test from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { isRecord } from "@line_bot_v1/platform/validation";
import {
  NAMESPACE_FAMILIES,
  NAMESPACE_PROFILES,
  NamespaceError,
  normalizeNamespaceName,
} from "../src/index.js";
import {
  claimScopedName,
  releaseScopedName,
  renameScopedName,
  resolveScopedName,
} from "../src/postgres.js";

test("v1 profiles preserve each family's established normalization semantics", () => {
  assert.equal(Object.isFrozen(NAMESPACE_PROFILES), true);
  assert.equal(Object.isFrozen(NAMESPACE_FAMILIES), true);
  for (const profile of Object.values(NAMESPACE_PROFILES)) {
    assert.equal(Object.isFrozen(profile), true);
    assert.equal(Object.isFrozen(profile.targetKinds), true);
  }
  assert.equal(normalizeNamespaceName("account-login", " Alice-2 "), "alice-2");
  assert.equal(normalizeNamespaceName("enterprise-slug", " ACME "), "acme");
  assert.equal(normalizeNamespaceName("repository-name", " Café "), "Café");
  assert.equal(normalizeNamespaceName("organization-team-slug", " Ａ-研發 "), "a-研發");
  assert.equal(normalizeNamespaceName("enterprise-team-slug", " PLATFORM-1 "), "platform-1");
  assert.equal(normalizeNamespaceName("repository-label", " Bug "), " Bug ");
  assert.equal(normalizeNamespaceName("organization-issue-type", " Incident "), "Incident");
  assert.equal(normalizeNamespaceName("discussion-category", " Ideas "), "ideas");
  assert.equal(normalizeNamespaceName("project-field", " Status "), " Status ");
  assert.equal(normalizeNamespaceName("field-option", " Ready "), " Ready ");
  assert.equal(normalizeNamespaceName("project-view", " Roadmap "), " Roadmap ");
  assert.equal(normalizeNamespaceName("repository-name", "\tRepo\u00a0"), "Repo");
  assert.equal(normalizeNamespaceName("organization-issue-type", "\r\nIncident\u3000"), "Incident");
  assert.equal(normalizeNamespaceName("organization-team-slug", "\u3000Ａ-研發\u3000"), "a-研發");
  assert.equal(normalizeNamespaceName("repository-label", "\tBug\u00a0"), "\tBug\u00a0");
  assert.equal(normalizeNamespaceName("repository-name", "😀".repeat(50)), "😀".repeat(50));
  assert.throws(() => normalizeNamespaceName("repository-name", "😀".repeat(51)), NamespaceError);
  assert.throws(
    () => normalizeNamespaceName("repository-label", "\t\r\n\u00a0\u3000"),
    NamespaceError,
  );
  assert.throws(
    () => normalizeNamespaceName("account-login", "settings"),
    (error) => error instanceof NamespaceError && error.status === 400,
  );
});

test("PostgreSQL profiles match ECMAScript trim and UTF-16 length semantics", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());
  const cases = [
    ["repository-name", "OWNER_ACCOUNT", "owner", "REPOSITORY", "\tRepo\u00a0", "Repo", "Repo"],
    [
      "organization-issue-type",
      "ORGANIZATION",
      "org",
      "ISSUE_TYPE",
      "\r\nIncident\u3000",
      "Incident",
      "Incident",
    ],
    [
      "organization-team-slug",
      "ORGANIZATION",
      "org",
      "TEAM",
      "\u3000Ａ-研發\u3000",
      "Ａ-研發",
      "a-研發",
    ],
    ["repository-label", "REPOSITORY", "repo", "LABEL", "\tBug\u00a0", "Bug", "\tBug\u00a0"],
  ] as const;
  for (const [family, scopeKind, scopeId, targetKind, raw, trimmed, expected] of cases) {
    assert.equal(
      (await pg.query<{ value: string }>("SELECT app_private.namespace_trim($1) AS value", [raw]))
        .rows[0]?.value,
      trimmed,
    );
    if (raw !== expected && family !== "repository-label") {
      await assert.rejects(
        pg.query("SELECT * FROM app_private.namespace_name_profile($1,$2,$3,$4,$5)", [
          family,
          scopeKind,
          scopeId,
          targetKind,
          raw,
        ]),
        (error: unknown) => isRecord(error) && error.code === "22023",
      );
    }
    assert.equal(
      (
        await pg.query<{ normalized_name: string }>(
          "SELECT normalized_name FROM app_private.namespace_name_profile($1,$2,$3,$4,$5)",
          [family, scopeKind, scopeId, targetKind, expected],
        )
      ).rows[0]?.normalized_name,
      expected,
    );
  }
  assert.equal(
    (
      await pg.query<{ normalized_name: string }>(
        "SELECT normalized_name FROM app_private.namespace_name_profile('repository-name','OWNER_ACCOUNT','owner','REPOSITORY',$1)",
        ["😀".repeat(50)],
      )
    ).rows[0]?.normalized_name,
    "😀".repeat(50),
  );
  await assert.rejects(
    pg.query(
      "SELECT * FROM app_private.namespace_name_profile('repository-name','OWNER_ACCOUNT','owner','REPOSITORY',$1)",
      ["😀".repeat(51)],
    ),
    (error: unknown) => isRecord(error) && error.code === "22023",
  );
});

test("scoped claims enforce collisions, repository aliases, release, reclaim, and rollback", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    await sql.query("INSERT INTO users(id,status,\"createdAt\") VALUES('owner','active',1)");
    await sql.query("SELECT app_private.claim_account_login('owner','USER','owner',1)");
    await sql.query(
      "SELECT * FROM app_private.provision_repository('repo-1','owner','owner','USER','Alpha','private')",
    );
    await sql.query(
      "SELECT * FROM app_private.provision_repository('repo-2','owner','owner','USER','Other','private')",
    );
  });
  const at = Date.now() + 10_000;
  const scope = {
    family: "repository-name" as const,
    scopeKind: "OWNER_ACCOUNT" as const,
    scopeId: "owner",
    targetKind: "REPOSITORY" as const,
  };

  assert.deepEqual(await db.transaction((sql) => resolveScopedName(sql, scope, "Alpha")), {
    targetKind: "REPOSITORY",
    targetId: "repo-1",
    name: "Alpha",
    currentName: "Alpha",
    alias: false,
  });
  await assert.rejects(
    db.transaction(async (sql) => {
      await renameScopedName(sql, {
        ...scope,
        targetId: "repo-2",
        expectedName: "Other",
        name: "alpha",
        at,
      });
      await sql.query("UPDATE repositories SET name='alpha',version=version+1 WHERE id='repo-2'");
    }),
    (error) => error instanceof NamespaceError && error.status === 409,
  );

  await db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO repository_name_history(repository_id,old_name,renamed_at) VALUES('repo-1','Alpha',3) ON CONFLICT DO NOTHING",
    );
    await sql.query("UPDATE repositories SET name='ALPHA',version=version+1 WHERE id='repo-1'");
    await renameScopedName(sql, {
      ...scope,
      targetId: "repo-1",
      expectedName: "Alpha",
      name: "ALPHA",
      at: at + 1,
    });
  });
  await db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO repository_name_history(repository_id,old_name,renamed_at) VALUES('repo-1','ALPHA',4) ON CONFLICT DO NOTHING",
    );
    await sql.query("UPDATE repositories SET name='Beta',version=version+1 WHERE id='repo-1'");
    await renameScopedName(sql, {
      ...scope,
      targetId: "repo-1",
      expectedName: "ALPHA",
      name: "Beta",
      at: at + 2,
    });
  });
  assert.deepEqual(await db.transaction((sql) => resolveScopedName(sql, scope, "alpha")), {
    targetKind: "REPOSITORY",
    targetId: "repo-1",
    name: "ALPHA",
    currentName: "Beta",
    alias: true,
  });

  await db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO repository_name_history(repository_id,old_name,renamed_at) VALUES('repo-1','Beta',5) ON CONFLICT DO NOTHING",
    );
    await sql.query("UPDATE repositories SET name='Alpha',version=version+1 WHERE id='repo-1'");
    await renameScopedName(sql, {
      ...scope,
      targetId: "repo-1",
      expectedName: "Beta",
      name: "Alpha",
      at: at + 3,
    });
  });
  assert.deepEqual(await db.transaction((sql) => resolveScopedName(sql, scope, "Beta")), {
    targetKind: "REPOSITORY",
    targetId: "repo-1",
    name: "Beta",
    currentName: "Alpha",
    alias: true,
  });

  const labelScope = {
    family: "repository-label" as const,
    scopeKind: "REPOSITORY" as const,
    scopeId: "repo-1",
    targetKind: "LABEL" as const,
  };
  await db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO repository_labels(id,repository_id,name,color,version) VALUES('label-1','repo-1','Bug','ff0000',1)",
    );
    await claimScopedName(sql, { ...labelScope, targetId: "label-1", name: "Bug", at: at + 4 });
  });
  await db.transaction(async (sql) => {
    await sql.query("DELETE FROM repository_labels WHERE id='label-1'");
    await releaseScopedName(sql, {
      ...labelScope,
      targetId: "label-1",
      expectedName: "Bug",
      at: at + 5,
    });
  });
  assert.equal(await db.transaction((sql) => resolveScopedName(sql, labelScope, "Bug")), null);
  await assert.rejects(
    db.transaction((sql) =>
      releaseScopedName(sql, {
        ...labelScope,
        targetId: "label-1",
        expectedName: "Bug",
        at: at + 6,
      }),
    ),
    (error) => error instanceof NamespaceError && error.status === 409,
  );

  await assert.rejects(
    db.transaction(async (sql) => {
      await sql.query(
        "INSERT INTO repository_labels(id,repository_id,name,color,version) VALUES('label-2','repo-1','RolledBack','00ff00',1)",
      );
      await claimScopedName(sql, {
        ...labelScope,
        targetId: "label-2",
        name: "RolledBack",
        at: at + 7,
      });
      throw new Error("rollback");
    }),
    /rollback/,
  );
  assert.equal(
    await db.transaction((sql) => resolveScopedName(sql, labelScope, "RolledBack")),
    null,
  );
  await assert.rejects(
    pg.query("UPDATE app_private.namespace_binding_history SET changed_at=99"),
    (error: unknown) => isRecord(error) && error.code === "55000",
  );
});

test("provider rejects lifecycle operations that a family does not support", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await assert.rejects(
    db.transaction((sql) =>
      renameScopedName(sql, {
        family: "enterprise-slug",
        scopeKind: "GLOBAL",
        scopeId: "global",
        targetKind: "ENTERPRISE",
        targetId: "enterprise-1",
        expectedName: "before",
        name: "after",
        at: 1,
      }),
    ),
    (error) => error instanceof NamespaceError && error.status === 400,
  );
});

test("line_app cannot bypass scoped Namespace functions with direct table writes", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await assert.rejects(
    db.transaction((sql) =>
      sql.query(
        `INSERT INTO namespace_bindings(
           family,scope_kind,scope_id,target_kind,target_id,current_name,canonical_key,version,updated_at
         ) VALUES('project-view','PROJECT','p','PROJECT_VIEW','v','View','View',1,1)`,
      ),
    ),
    (error: unknown) => isRecord(error) && error.code === "42501",
  );
});
