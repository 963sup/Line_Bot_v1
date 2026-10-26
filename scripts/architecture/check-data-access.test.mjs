import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { checkDataAccess } from "./check-data-access.mjs";
import { validateRuntimeDataAccess } from "./data-access-core.mjs";

const querySource = (sql) => `sql.query(${JSON.stringify(sql)});`;

function fixture() {
  return {
    semanticModel: { semanticOwners: [{ id: "account" }, { id: "attendance" }] },
    implementationTopology: {
      modules: {
        "@line_bot_v1/account": { path: "packages/account", semanticOwner: "account" },
        "@line_bot_v1/attendance": { path: "packages/attendance", semanticOwner: "attendance" },
      },
    },
    dataTopology: {
      relations: [
        { name: "users", authority: true, semanticOwner: "account" },
        { name: "attendance_sessions", authority: true, semanticOwner: "attendance" },
        {
          name: "attendance_identity_bindings",
          authority: false,
          role: "derived-projection",
          participants: ["account", "attendance"],
        },
      ],
    },
  };
}

test("owner adapter may read and mutate its authoritative relation", () => {
  const f = fixture();
  assert.deepEqual(
    validateRuntimeDataAccess(f.semanticModel, f.implementationTopology, f.dataTopology, {
      "packages/attendance/src/adapters/outbound/persistence/postgres-attendance-store.ts":
        querySource(
          "SELECT * FROM attendance_sessions; UPDATE attendance_sessions SET ended_at=$1 WHERE id=$2",
        ),
    }).errors,
    [],
  );
});

test("foreign authoritative mutation is rejected", () => {
  const f = fixture();
  const errors = validateRuntimeDataAccess(
    f.semanticModel,
    f.implementationTopology,
    f.dataTopology,
    {
      "packages/attendance/src/adapters/outbound/persistence/postgres-attendance-store.ts":
        querySource("UPDATE users SET status='active' WHERE id=$1"),
    },
  ).errors;
  assert.match(errors.join("\n"), /mutates users owned by account/);
});

test("foreign authoritative read is rejected", () => {
  const f = fixture();
  const errors = validateRuntimeDataAccess(
    f.semanticModel,
    f.implementationTopology,
    f.dataTopology,
    {
      "packages/attendance/src/adapters/outbound/persistence/postgres-attendance-store.ts":
        querySource("SELECT * FROM users"),
    },
  ).errors;
  assert.match(errors.join("\n"), /reads users owned by account/);
});

test("declared derived projection read is allowed", () => {
  const f = fixture();
  assert.deepEqual(
    validateRuntimeDataAccess(f.semanticModel, f.implementationTopology, f.dataTopology, {
      "packages/attendance/src/adapters/outbound/persistence/postgres-attendance-store.ts":
        querySource("SELECT * FROM attendance_identity_bindings"),
    }).errors,
    [],
  );
});

test("undeclared derived projection consumer is rejected", () => {
  const f = fixture();
  f.dataTopology.relations[2].participants = ["account"];
  const errors = validateRuntimeDataAccess(
    f.semanticModel,
    f.implementationTopology,
    f.dataTopology,
    {
      "packages/attendance/src/adapters/outbound/persistence/postgres-attendance-store.ts":
        querySource("SELECT * FROM attendance_identity_bindings"),
    },
  ).errors;
  assert.match(errors.join("\n"), /without declared read-only projection participation/);
});

test("ordinary non-SQL domain text is outside the database access surface", () => {
  const f = fixture();
  assert.deepEqual(
    validateRuntimeDataAccess(f.semanticModel, f.implementationTopology, f.dataTopology, {
      "packages/attendance/src/domain.ts":
        'export const message = "Could not SELECT * FROM users";',
    }).errors,
    [],
  );
});

for (const [name, path, query] of [
  ["src/postgres", "packages/attendance/src/postgres/store.ts", "SELECT * FROM users"],
  ["root postgres", "packages/attendance/src/postgres.ts", "SELECT * FROM users"],
  ["other source placement", "packages/attendance/src/persistence.ts", "SELECT * FROM users"],
  ["Windows paths", "packages\\attendance\\src\\adapters\\postgres.ts", "SELECT * FROM users"],
  [
    "quoted schema",
    "packages/attendance/src/adapters/postgres.ts",
    'UPDATE "app_private"."users" SET status=$1',
  ],
  [
    "comma sources",
    "packages/attendance/src/adapters/postgres.ts",
    "SELECT * FROM attendance_sessions s, users u",
  ],
  [
    "DELETE USING",
    "packages/attendance/src/adapters/postgres.ts",
    "DELETE FROM attendance_sessions USING users",
  ],
  [
    "UPDATE FROM",
    "packages/attendance/src/adapters/postgres.ts",
    "UPDATE attendance_sessions SET ended_at=1 FROM users",
  ],
  [
    "nested CTE read",
    "packages/attendance/src/adapters/postgres.ts",
    "WITH source AS (SELECT * FROM users) SELECT * FROM source",
  ],
  [
    "INSERT SELECT",
    "packages/attendance/src/adapters/postgres.ts",
    "INSERT INTO attendance_sessions SELECT * FROM users",
  ],
  [
    "quoted TRUNCATE",
    "packages/attendance/src/adapters/postgres.ts",
    'TRUNCATE "app_private"."users", attendance_sessions',
  ],
  [
    "SQL comments between identifiers",
    "packages/attendance/src/adapters/postgres.ts",
    'SELECT * FROM "app_private" /* comment */ . "users"',
  ],
]) {
  test(`actual SQL cannot bypass ownership through ${name}`, () => {
    const f = fixture();
    const errors = validateRuntimeDataAccess(
      f.semanticModel,
      f.implementationTopology,
      f.dataTopology,
      {
        [path]: querySource(query),
      },
    ).errors;
    assert.match(errors.join("\n"), /(?:reads|mutates) users owned by account/);
  });
}

test("JS comments containing SQL do not constitute database access", () => {
  const f = fixture();
  assert.deepEqual(
    validateRuntimeDataAccess(f.semanticModel, f.implementationTopology, f.dataTopology, {
      "packages/attendance/src/adapters/postgres.ts":
        "// SELECT * FROM users\nexport const value = 1;",
    }).errors,
    [],
  );
});

test("CTE aliases are lexical; a later same-named alias cannot hide an earlier physical read", () => {
  const f = fixture();
  const validate = (sql) =>
    validateRuntimeDataAccess(f.semanticModel, f.implementationTopology, f.dataTopology, {
      "packages/attendance/src/postgres/store.ts": querySource(sql),
    });
  assert.deepEqual(
    validate("WITH users AS (SELECT * FROM attendance_sessions) SELECT * FROM users").errors,
    [],
  );
  assert.match(
    validate(
      "WITH first AS (SELECT * FROM users), users AS (SELECT * FROM attendance_sessions) SELECT * FROM first",
    ).errors.join("\n"),
    /reads users owned by account/,
  );
  assert.match(
    validate(
      "WITH users AS (SELECT * FROM attendance_sessions) SELECT * FROM app_private.users",
    ).errors.join("\n"),
    /reads users owned by account/,
  );
  assert.match(
    validate(
      "WITH users AS (SELECT * FROM attendance_sessions) UPDATE users SET status=$1",
    ).errors.join("\n"),
    /mutates users owned by account/,
  );
});

test("SQL comments and string values do not create relation references", () => {
  const f = fixture();
  const result = validateRuntimeDataAccess(
    f.semanticModel,
    f.implementationTopology,
    f.dataTopology,
    {
      "packages/attendance/src/postgres/store.ts": querySource(
        "SELECT 'FROM users' AS note FROM attendance_sessions /* JOIN users */ -- UPDATE users\n",
      ),
    },
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.queryCount, 1);
});

test("every module is checked when two modules share one semantic owner", () => {
  const f = fixture();
  f.implementationTopology.modules.another = {
    path: "packages/attendance-query",
    semanticOwner: "attendance",
  };
  const result = validateRuntimeDataAccess(
    f.semanticModel,
    f.implementationTopology,
    f.dataTopology,
    {
      "packages/attendance/src/read.ts": querySource("SELECT * FROM users"),
      "packages/attendance-query/src/read.ts": querySource("SELECT * FROM users"),
    },
  );
  assert.equal(result.violationCount, 2);
  assert.equal(result.analysisFailureCount, 0);
});

test("application host has no implicit business data authority", () => {
  const f = fixture();
  f.implementationTopology.applications = {
    web: { path: "apps/web", moduleKind: "application-host", semanticOwner: null },
  };
  const result = validateRuntimeDataAccess(
    f.semanticModel,
    f.implementationTopology,
    f.dataTopology,
    {
      "apps/web/src/route.ts": querySource("SELECT * FROM users"),
    },
  );
  assert.equal(result.violationCount, 1);
});

test("unsupported or malformed SQL and unknown app relations are analysis failures", () => {
  const f = fixture();
  for (const sql of [
    "SELECT * FRM users",
    "SELECT * FROM missing_relation",
    "DO $$ BEGIN EXECUTE 'SELECT * FROM users'; END $$",
  ]) {
    const result = validateRuntimeDataAccess(
      f.semanticModel,
      f.implementationTopology,
      f.dataTopology,
      {
        "packages/attendance/src/postgres/store.ts": querySource(sql),
      },
    );
    assert.ok(result.analysisFailureCount > 0, sql);
    assert.equal(result.violationCount, 0);
  }
});

test("unresolved dynamic relations fail analysis; finite constants and repaired projections pass", () => {
  const f = fixture();
  const path = "packages/attendance/src/read.ts";
  const unresolved = validateRuntimeDataAccess(
    f.semanticModel,
    f.implementationTopology,
    f.dataTopology,
    {
      [path]: "sql.query(`SELECT * FROM ${runtimeTable}`);",
    },
  );
  assert.ok(unresolved.analysisFailureCount > 0);
  const finite = validateRuntimeDataAccess(
    f.semanticModel,
    f.implementationTopology,
    f.dataTopology,
    {
      [path]:
        'const table = flag ? "attendance_sessions" : "users"; sql.query(`SELECT * FROM ${table}`);',
    },
  );
  assert.equal(finite.analysisFailureCount, 0);
  assert.equal(finite.violationCount, 1);
  const repaired = validateRuntimeDataAccess(
    f.semanticModel,
    f.implementationTopology,
    f.dataTopology,
    {
      [path]: querySource("SELECT * FROM attendance_identity_bindings"),
    },
  );
  assert.deepEqual(repaired.errors, []);
});

test("projection writes stay forbidden and quoted owner writes remain legal", () => {
  const f = fixture();
  const validate = (sql) =>
    validateRuntimeDataAccess(f.semanticModel, f.implementationTopology, f.dataTopology, {
      "packages/attendance/src/postgres/store.ts": querySource(sql),
    });
  assert.deepEqual(
    validate('UPDATE "app_private"."attendance_sessions" SET ended_at=$1').errors,
    [],
  );
  assert.match(
    validate("DELETE FROM attendance_identity_bindings").errors.join("\n"),
    /without declared read-only projection participation/,
  );
});

test("constrained projections permit only declared participant reads", () => {
  const f = fixture();
  f.dataTopology.relations[2].role = "constrained-projection";
  const validate = (sql) =>
    validateRuntimeDataAccess(f.semanticModel, f.implementationTopology, f.dataTopology, {
      "packages/attendance/src/read.ts": querySource(sql),
    });
  assert.deepEqual(validate("SELECT * FROM attendance_identity_bindings").errors, []);
  assert.equal(validate("UPDATE attendance_identity_bindings SET status=$1").violationCount, 1);
  f.dataTopology.relations[2].participants = ["account"];
  assert.equal(validate("SELECT * FROM attendance_identity_bindings").violationCount, 1);
});

test("FOR UPDATE OF aliases do not become invented physical relations", () => {
  const f = fixture();
  const result = validateRuntimeDataAccess(
    f.semanticModel,
    f.implementationTopology,
    f.dataTopology,
    {
      "packages/attendance/src/read.ts": querySource(
        "SELECT * FROM attendance_sessions s FOR UPDATE OF s",
      ),
    },
  );
  assert.deepEqual(result.errors, []);
});

test("collector uses canonical module and application roots with normalized filesystem paths", async (t) => {
  await mkdir(join(process.cwd(), ".artifacts"), { recursive: true });
  const root = await mkdtemp(join(process.cwd(), ".artifacts", "sql-access-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const f = fixture();
  f.implementationTopology.modules["@line_bot_v1/attendance"].path = "services/attendance";
  f.implementationTopology.applications = {
    web: { path: "hosts/web", moduleKind: "application-host", semanticOwner: null },
  };
  const files = {
    "pnpm-workspace.yaml": "packages:\n  - packages/*\n  - services/*\n  - hosts/*\n  - apps/*\n",
    "architecture/semantic-model.json": JSON.stringify(f.semanticModel),
    "architecture/implementation-topology.json": JSON.stringify(f.implementationTopology),
    "architecture/data-topology.json": JSON.stringify(f.dataTopology),
    "packages/account/package.json": "{}",
    "services/attendance/package.json": JSON.stringify({
      exports: {
        "./testing/fixture": { default: "./dist/testing/fixture.js" },
        "./testing/escape": { default: "./dist/postgres.js" },
      },
    }),
    "hosts/web/package.json": "{}",
    "services/attendance/src/postgres/store.cts": querySource("SELECT * FROM users"),
    "services/attendance/src/postgres.ts": `${querySource("SELECT * FROM users")} export {};`,
    "hosts/web/src/query.mts": querySource("SELECT * FROM users"),
    "services/attendance/src/testing/fixture.ts": 'pg.exec("CREATE DATABASE test");',
    "services/attendance/src/testing/still-runtime.ts": querySource(
      "SELECT * FROM attendance_sessions",
    ),
  };
  for (const [path, text] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, text);
  }
  const result = await checkDataAccess(root);
  assert.equal(result.sourceCount, 4);
  assert.equal(result.queryCount, 4);
  assert.equal(result.testingOnlySourceCount, 1);
  assert.equal(result.violationCount, 3);
  assert.equal(result.analysisFailureCount, 0);
  assert.equal(
    result.errors.some((error) => error.includes("\\")),
    false,
  );
  await mkdir(join(root, "apps/admin/src"), { recursive: true });
  await writeFile(
    join(root, "apps/admin/package.json"),
    JSON.stringify({ name: "@example/admin" }),
  );
  await writeFile(join(root, "apps/admin/src/query.ts"), querySource("SELECT * FROM users"));
  const unregistered = await checkDataAccess(root);
  assert.ok(
    unregistered.errors.some((error) => error.includes("apps/admin is an unregistered workspace")),
  );
  assert.equal(unregistered.analysisFailureCount, 1);
  await writeFile(
    join(root, "services/attendance/package.json"),
    JSON.stringify({
      exports: {
        "./testing/fixture": { default: "./dist/testing/fixture.js" },
        "./fixture-runtime": { default: "./dist/testing/fixture.js" },
      },
    }),
  );
  const alsoRuntime = await checkDataAccess(root);
  assert.equal(alsoRuntime.testingOnlySourceCount, 0);
  assert.equal(alsoRuntime.sourceCount, 5);
  assert.ok(alsoRuntime.errors.some((error) => error.includes("cannot parse runtime SQL")));
});

test("support modules cannot self-authorize arbitrary raw SQL forwarding", () => {
  const f = fixture();
  f.semanticModel.semanticOwners.push({ id: "platform" });
  f.implementationTopology.modules.platform = {
    path: "packages/platform",
    semanticOwner: "platform",
    moduleKind: "support-module",
  };
  const sources = {
    "packages/platform/src/raw.ts": "export function forward(db, text) { return db.query(text); }",
    "packages/attendance/src/run.ts":
      'import {forward} from "../../platform/src/raw.js"; forward(db, "UPDATE users SET status=$1");',
  };
  const result = validateRuntimeDataAccess(
    f.semanticModel,
    f.implementationTopology,
    f.dataTopology,
    sources,
  );
  assert.ok(result.errors.length > 0);
  assert.equal(result.forwardedCount, 0);
});

test("collector derives public SQL wrapper boundaries from every runtime export condition", async (t) => {
  await mkdir(join(process.cwd(), ".artifacts"), { recursive: true });
  const root = await mkdtemp(join(process.cwd(), ".artifacts", "sql-public-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const f = fixture();
  const files = {
    "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
    "architecture/semantic-model.json": JSON.stringify(f.semanticModel),
    "architecture/implementation-topology.json": JSON.stringify(f.implementationTopology),
    "architecture/data-topology.json": JSON.stringify(f.dataTopology),
    "packages/account/package.json": "{}",
    "packages/attendance/package.json": JSON.stringify({ exports: "./dist/index.js" }),
    "packages/attendance/src/index.ts": "export const marker = 1;",
    "packages/attendance/src/private.ts":
      "export function run(db, text) { return db.query(text); }",
    "packages/attendance/src/use.ts":
      'import {run} from "./private.js"; run(db, "SELECT * FROM attendance_sessions");',
    "packages/attendance/src/public.ts": 'export {run} from "./private.js";',
  };
  for (const [path, text] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, text);
  }
  assert.deepEqual((await checkDataAccess(root)).errors, []);
  const manifest = join(root, "packages/attendance/package.json");
  await writeFile(
    manifest,
    JSON.stringify({
      exports: {
        ".": { types: "./dist/index.d.ts", import: "./dist/index.js", require: "./dist/public.js" },
      },
    }),
  );
  assert.ok(
    (await checkDataAccess(root)).errors.some((error) => error.includes("public SQL wrapper")),
  );
  await writeFile(manifest, JSON.stringify({ exports: { "./missing": "./dist/missing.js" } }));
  assert.ok(
    (await checkDataAccess(root)).errors.some((error) => error.includes("has no analyzed source")),
  );
  await writeFile(manifest, JSON.stringify({ exports: { "./*": "./dist/*.js" } }));
  assert.ok(
    (await checkDataAccess(root)).errors.some((error) =>
      error.includes("unsupported runtime export"),
    ),
  );
});
