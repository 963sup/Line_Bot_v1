import assert from "node:assert/strict";
import { test } from "node:test";
import { createSql } from "../src/database/postgres/database.js";
import { postgresFixture } from "../src/testing/postgres.js";
import { numericValue, stringValue } from "../src/validation.js";

test("SQL decoding rejects a changed projection instead of trusting a caller type", async () => {
  const sql = createSql(async () => ({ rows: [{ id: 42 }], rowCount: 1 }));
  await assert.rejects(
    sql.query("select id", undefined, (row) => ({ id: stringValue(row.id) })),
    TypeError,
  );
  const result = await sql.query("select id", undefined, (row) => ({
    id: Number(numericValue(row.id)),
  }));
  assert.deepEqual(result.rows, [{ id: 42 }]);
  if (false) {
    // @ts-expect-error a typed SQL projection requires its runtime decoder
    sql.query<{ id: string }>("select id", []);
  }
});

test("fixture admin and business queries both execute the supplied decoder", async (t) => {
  const { pg, sql, db } = await postgresFixture();
  t.after(() => pg.close());
  const decode = (row: Record<string, unknown>) => ({ id: stringValue(row.id) });
  assert.deepEqual((await sql.query("select 'admin'::text as id", [], decode)).rows, [
    { id: "admin" },
  ]);
  await db.transaction(async (transaction) => {
    assert.deepEqual((await transaction.query("select 'business'::text as id", [], decode)).rows, [
      { id: "business" },
    ]);
    await assert.rejects(transaction.query("select 42 as id", [], decode), TypeError);
  });
});
