import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { PostgresDatabase } from "../src/postgres.js";

test("operator entries can own and close a database through the public Postgres export", () => {
  assert.equal(typeof PostgresDatabase, "function");
  assert.equal(typeof PostgresDatabase.prototype.transaction, "function");
  assert.equal(typeof PostgresDatabase.prototype.close, "function");
});

test("PGlite refuses an unsafe Node process before allocating WASM", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import { postgresFixture } from './src/testing/postgres.ts';
    await assert.rejects(postgresFixture(), /PGlite requires --no-wasm-code-gc/);
  `,
    ],
    { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 30000 },
  );
  assert.equal(result.status, 0, result.stderr);
});

test("the protected Node process still initializes, queries and closes PostgreSQL", (t) => {
  const result = spawnSync(
    process.execPath,
    [
      "--no-wasm-code-gc",
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import { postgresFixture } from './src/testing/postgres.ts';
    const {pg}=await postgresFixture();
    try { assert.equal((await pg.query('SELECT 1 AS n')).rows[0].n,1); }
    finally { await pg.close(); }
  `,
    ],
    {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
      timeout: 30000,
      env: { ...process.env, PGLITE_FIXTURE_PROFILE: "1" },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const reportLine = result.stderr
    .split(/\r?\n/)
    .find((line) => line.startsWith("PGLITE_FIXTURE_PROFILE "));
  assert.ok(reportLine, result.stderr);
  const report: unknown = JSON.parse(reportLine.slice("PGLITE_FIXTURE_PROFILE ".length));
  assert.ok(report !== null && typeof report === "object" && !Array.isArray(report));
  assert.ok("event" in report);
  assert.equal(report.event, "pglite-fixture-ready");
  for (const key of ["startupMs", "schemaReadMs", "schemaApplyMs", "totalMs"] as const) {
    assert.ok(key in report);
    const duration: unknown = Object.entries(report).find(([field]) => field === key)?.[1];
    assert.ok(typeof duration === "number" && Number.isFinite(duration) && duration >= 0);
  }
  assert.ok("schemaFileCount" in report);
  const count = report.schemaFileCount;
  assert.ok(typeof count === "number" && Number.isInteger(count) && count > 0);
  t.diagnostic(reportLine);
});
