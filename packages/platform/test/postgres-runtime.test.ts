import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

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

test("the protected Node process still initializes, queries and closes PostgreSQL", () => {
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
    { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 30000 },
  );
  assert.equal(result.status, 0, result.stderr);
});
