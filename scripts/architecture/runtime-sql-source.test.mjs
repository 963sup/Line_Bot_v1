import assert from "node:assert/strict";
import test from "node:test";
import { extractRuntimeSql } from "./runtime-sql-source.mjs";

test("extracts real SQL expressions and ignores SQL-looking comments and messages", () => {
  const result = extractRuntimeSql({
    "packages/example/src/postgres.ts": `
      type Sql = { query(text: string, values?: unknown[]): Promise<unknown> };
      const fragment = "SELECT id FROM accounts";
      async function read(sql: Sql, detailed: boolean, lock: boolean) {
        // sql.query("DELETE FROM comments_only")
        const message = "SELECT * FROM user_message";
        await sql.query(
          fragment + (detailed ? " WHERE active" : " WHERE archived") +
            (lock ? " FOR UPDATE" : ""),
        );
      }
    `,
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.forwarded.length, 0);
  assert.deepEqual(
    result.queries.map(({ sql }) => sql).sort(),
    [
      "SELECT id FROM accounts WHERE active",
      "SELECT id FROM accounts WHERE active FOR UPDATE",
      "SELECT id FROM accounts WHERE archived",
      "SELECT id FROM accounts WHERE archived FOR UPDATE",
    ].sort(),
  );
});

test("uses lexical symbols for shadowed const SQL fragments", () => {
  const result = extractRuntimeSql({
    "packages/example/src/shadow.ts": `
      type Sql = { query(text: string): Promise<unknown> };
      const selection = "SELECT id FROM outer_table";
      async function outer(sql: Sql) {
        await sql.query(selection);
        {
          const selection = "SELECT id FROM inner_table";
          await sql.query(selection);
        }
      }
    `,
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.queries.map(({ sql }) => sql).sort(), [
    "SELECT id FROM inner_table",
    "SELECT id FROM outer_table",
  ]);
});

test("normalizes Windows source paths in evidence", () => {
  const result = extractRuntimeSql({
    "packages\\example\\src\\postgres.ts": `
      type Sql = { query(text: string): Promise<unknown> };
      declare const sql: Sql;
      void sql.query("SELECT id FROM accounts");
    `,
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.queries[0].path, "packages/example/src/postgres.ts");
});

test("extracts renamed SQL receivers, aliased Sql types, and bracket query calls", () => {
  const result = extractRuntimeSql({
    "packages/platform/src/sql.ts": `export interface Sql { query(text: string): Promise<unknown> }`,
    "packages/example/src/aliased.ts": `
      import type { Sql as ImportedSql } from "../../platform/src/sql.js";
      type DatabaseConnection = ImportedSql;
      async function read(database: DatabaseConnection) {
        await database.query("SELECT id FROM renamed_receiver");
        await database["query"]("SELECT id FROM bracket_receiver");
      }
    `,
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.queries.map(({ sql }) => sql).sort(), [
    "SELECT id FROM bracket_receiver",
    "SELECT id FROM renamed_receiver",
  ]);
});

test("extracts destructured and chained query aliases", () => {
  const result = extractRuntimeSql({
    "packages/example/src/destructured.ts": `
      declare const database: { query(text: string): Promise<unknown> };
      const { query } = database;
      const execute = query;
      void execute("UPDATE users SET status='active'");
    `,
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.queries.map(({ sql }) => sql),
    ["UPDATE users SET status='active'"],
  );
});

test("extracts a nested destructured query alias", () => {
  const result = extractRuntimeSql({
    "packages/example/src/nested-destructured.ts": `
      declare const holder: {
        db: { query(text: string): Promise<unknown> };
      };
      const { db: { query } } = holder;
      void query("SELECT id FROM nested_destructured");
    `,
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.queries.map(({ sql }) => sql),
    ["SELECT id FROM nested_destructured"],
  );
});

test("extracts a query alias from a finite computed destructuring key", () => {
  const result = extractRuntimeSql({
    "packages/example/src/computed-destructured.ts": `
      declare const database: { query(text: string): Promise<unknown> };
      const key = "query";
      const { [key]: execute } = database;
      void execute("SELECT id FROM computed_destructured");
    `,
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.queries.map(({ sql }) => sql),
    ["SELECT id FROM computed_destructured"],
  );
});

test("fails closed for an unknown computed destructuring key on unresolved Sql", () => {
  const result = extractRuntimeSql({
    "packages/example/src/unknown-computed-destructured.ts": `
      import type { Sql } from "@line_bot_v1/platform/postgres";
      declare const database: Sql;
      declare function choose(): string;
      const key = choose();
      const { [key]: execute } = database;
      void execute("SELECT id FROM unknown_computed_destructured");
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /computed destructured SQL method key/u);
});

test("extracts a query method bound to its receiver", () => {
  const result = extractRuntimeSql({
    "packages/example/src/bound.ts": `
      declare const database: { query(text: string): Promise<unknown> };
      const execute = database.query.bind(database);
      void execute("DELETE FROM expired_sessions");
    `,
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.queries.map(({ sql }) => sql),
    ["DELETE FROM expired_sessions"],
  );
});

test("extracts an immediately bound query method call", () => {
  const result = extractRuntimeSql({
    "packages/example/src/immediate-bind.ts": `
      declare const database: { query(text: string): Promise<unknown> };
      void database.query.bind(database)("SELECT id FROM immediate_bind");
    `,
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.queries.map(({ sql }) => sql),
    ["SELECT id FROM immediate_bind"],
  );
});

test("fails closed when an exported bound query alias becomes a public SQL capability", () => {
  const result = extractRuntimeSql({
    "packages/example/src/public-bound.ts": `
      declare const sql: { query(text: string): Promise<unknown> };
      export const rawQuery = sql.query.bind(sql);
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /escapes static analysis/u);
});

test("fails closed when a bound query method is passed to a higher-order function", () => {
  const result = extractRuntimeSql({
    "packages/example/src/bound-higher-order.ts": `
      declare const sql: { query(text: string): Promise<unknown> };
      declare function consume(method: (text: string) => Promise<unknown>): void;
      consume(sql.query.bind(sql));
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /escapes static analysis/u);
});

test("fails closed when query methods escape through call or apply", () => {
  const result = extractRuntimeSql({
    "packages/example/src/call-apply.ts": `
      declare const sql: { query(text: string): Promise<unknown> };
      void sql.query.call(sql, "UPDATE users SET status='call'");
      void sql.query.apply(sql, ["DELETE FROM users"]);
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.every((error) => /escapes static analysis/u.test(error)));
});

test("fails closed when an exported plain query alias becomes a public SQL capability", () => {
  const result = extractRuntimeSql({
    "packages/example/src/public-plain.ts": `
      declare const sql: { query(text: string): Promise<unknown> };
      export const rawQuery = sql.query;
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /escapes static analysis/u);
});

test("fails closed when a tracked query alias is exposed through another value", () => {
  const result = extractRuntimeSql({
    "packages/example/src/rebound-escape.ts": `
      declare const sql: { query(text: string): Promise<unknown> };
      const execute = sql.query.bind(sql);
      export const service = { execute };
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.ok(result.errors.some((error) => /escapes static analysis/u.test(error)));
});

test("fails closed when a query alias chain reaches a public export", () => {
  const result = extractRuntimeSql({
    "packages/example/src/public-chain.ts": `
      declare const sql: { query(text: string): Promise<unknown> };
      const execute = sql.query.bind(sql);
      export const rawQuery = execute;
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.ok(result.errors.some((error) => /public SQL method alias/u.test(error)));
});

test("fails closed when bind pre-applies SQL text", () => {
  const result = extractRuntimeSql({
    "packages/example/src/prebound.ts": `
      declare const sql: { query(text: string): Promise<unknown> };
      const execute = sql.query.bind(sql, "UPDATE users SET status='foreign'");
      void execute("SELECT id FROM incorrectly_assumed_safe");
      void sql.query.bind(sql, "DELETE FROM users")("SELECT id FROM also_incorrectly_safe");
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.ok(result.errors.some((error) => /pre-bound SQL/u.test(error)));
});

test("fails closed when a stored bind spreads unknown receiver and SQL arguments", () => {
  const result = extractRuntimeSql({
    "packages/example/src/prebound-spread-alias.ts": `
      declare const sql: { query(text: string): Promise<unknown> };
      const bindArgs: [typeof sql, string] = [sql, "UPDATE users SET status='foreign'"];
      const execute = sql.query.bind(...bindArgs);
      void execute("SELECT id FROM incorrectly_assumed_safe");
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.ok(result.errors.some((error) => /bind arguments/u.test(error)));
});

test("fails closed when an immediate bind spreads unknown receiver and SQL arguments", () => {
  const result = extractRuntimeSql({
    "packages/example/src/prebound-spread-immediate.ts": `
      declare const sql: { query(text: string): Promise<unknown> };
      const bindArgs: [typeof sql, string] = [sql, "DELETE FROM users"];
      void sql.query.bind(...bindArgs)("SELECT id FROM incorrectly_assumed_safe");
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.ok(result.errors.some((error) => /bind arguments/u.test(error)));
});

test("tracks query aliases when a package-imported Sql type is unresolved", () => {
  const result = extractRuntimeSql({
    "packages/example/src/unresolved-platform-type.ts": `
      import type { Sql } from "@line_bot_v1/platform/postgres";
      export function run(sql: Sql) {
        const direct = sql.query;
        const bound = sql.query.bind(sql);
        const { query } = sql;
        void direct("SELECT id FROM unresolved_direct");
        void bound("SELECT id FROM unresolved_bound");
        void query("SELECT id FROM unresolved_destructured");
      }
    `,
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.queries.map(({ sql }) => sql).sort(), [
    "SELECT id FROM unresolved_bound",
    "SELECT id FROM unresolved_destructured",
    "SELECT id FROM unresolved_direct",
  ]);
});

test("fails closed when a query alias receives arbitrary dynamic SQL", () => {
  const result = extractRuntimeSql({
    "packages/example/src/dynamic-alias.ts": `
      declare const database: { query(text: string): Promise<unknown> };
      function execute(runtimeSql: string) {
        const { query } = database;
        return query(runtimeSql);
      }
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /cannot statically determine SQL/u);
});

test("resolves a finite computed query method key", () => {
  const result = extractRuntimeSql({
    "packages/example/src/computed.ts": `
      declare const database: { query(text: string): Promise<unknown> };
      const method = "query";
      void database[method]("SELECT id FROM users");
    `,
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.queries.map(({ sql }) => sql),
    ["SELECT id FROM users"],
  );
});

test("fails closed when a SQL method reference escapes supported alias forms", () => {
  const result = extractRuntimeSql({
    "packages/example/src/escaped.ts": `
      declare const database: { query(text: string): Promise<unknown> };
      declare function consume(method: (text: string) => Promise<unknown>): void;
      consume(database.query);
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /escapes static analysis/u);
});

test("fails closed for a mutable SQL method alias", () => {
  const result = extractRuntimeSql({
    "packages/example/src/mutable.ts": `
      declare const database: { query(text: string): Promise<unknown> };
      let execute = database.query;
      execute = async () => undefined;
      void execute("SELECT id FROM incorrectly_assumed_sql");
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /mutable SQL method alias/u);
});

test("fails closed for a destructuring assignment of a SQL method", () => {
  const result = extractRuntimeSql({
    "packages/example/src/assignment-pattern.ts": `
      declare const database: { query(text: string): Promise<unknown> };
      let execute: (text: string) => Promise<unknown>;
      ({ query: execute } = database);
      void execute("SELECT id FROM assignment_pattern");
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /SQL method assignment pattern/u);
});

test("fails closed for a destructured formal query parameter", () => {
  const result = extractRuntimeSql({
    "packages/example/src/formal.ts": `
      declare const database: { query(text: string): Promise<unknown> };
      function run({ query }: { query(text: string): Promise<unknown> }) {
        return query("SELECT id FROM destructured_formal");
      }
      void run(database);
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /destructured SQL method parameter/u);
});

test("fails closed for a nested destructured formal query parameter", () => {
  const result = extractRuntimeSql({
    "packages/example/src/nested-formal.ts": `
      function run(
        { db: { query } }: { db: { query(text: string): Promise<unknown> } },
      ) {
        return query("SELECT id FROM nested_formal");
      }
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /destructured SQL method parameter/u);
});

test("fails closed for a mutable computed query method key", () => {
  const result = extractRuntimeSql({
    "packages/example/src/mutable-key.ts": `
      declare const database: { query(text: string): Promise<unknown> };
      let method = "query";
      void database[method]("SELECT id FROM mutable_key");
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /mutable computed SQL method key/u);
});

test("fails closed when a computed key type proves it may be query", () => {
  const result = extractRuntimeSql({
    "packages/example/src/literal-key.ts": `
      declare function choose(): "query";
      declare const database: { query(text: string): Promise<unknown> };
      const method: "query" = choose();
      void database[method]("SELECT id FROM hidden_computed_query");
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /computed SQL method key/u);
});

test("fails closed for a broad computed key on an unresolved Sql receiver", () => {
  const result = extractRuntimeSql({
    "packages/example/src/unresolved-computed.ts": `
      import type { Sql } from "@line_bot_v1/platform/postgres";
      declare const sql: Sql;
      declare function choose(): string;
      const method = choose();
      void sql[method]("SELECT id FROM hidden_unknown_receiver");
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /computed SQL method key/u);
});

test("fails closed for a computed call expression key on unresolved Sql", () => {
  const result = extractRuntimeSql({
    "packages/example/src/unresolved-computed-call.ts": `
      import type { Sql } from "@line_bot_v1/platform/postgres";
      declare const sql: Sql;
      declare function choose(): string;
      void sql[choose()]("SELECT id FROM hidden_computed_call");
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /computed SQL method key/u);
});

test("excludes calls whose source contract proves they are not SQL", () => {
  const result = extractRuntimeSql({
    "packages/example/src/non-sql.ts": `
      function use(deps: { query(): { read(): void } }, value: string) {
        deps.query().read();
        return /^(ok)$/.exec(value);
      }
    `,
  });

  assert.deepEqual(result, { queries: [], errors: [], forwarded: [] });
});

test("expands local SQL functions, finite table choices, and parameter indexes", () => {
  const result = extractRuntimeSql({
    "packages/example/src/composed.ts": `
      type Sql = { query(text: string): Promise<unknown> };
      function visible(object: string, revision: string) {
        return " WHERE " + object + ".revision_id=" + revision + ".id";
      }
      async function run(sql: Sql, kind: "management" | "referral", values: unknown[]) {
        const receiptTable = kind === "management"
          ? "partner_management_commands"
          : "partner_referral_commands";
        await sql.query(
          \`SELECT result FROM \${receiptTable}\${visible("o", "r")} AND actor=$\${values.length + 1}\`,
        );
      }
    `,
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.queries.map(({ sql }) => sql).sort(), [
    "SELECT result FROM partner_management_commands WHERE o.revision_id=r.id AND actor=$1",
    "SELECT result FROM partner_referral_commands WHERE o.revision_id=r.id AND actor=$1",
  ]);
});

test("does not canonicalize a nonnumeric length property as a parameter index", () => {
  const result = extractRuntimeSql({
    "packages/example/src/string-length.ts": `
      type Sql = { query(text: string, values: unknown[]): Promise<unknown> };
      function run(sql: Sql, input: { length: string }) {
        return sql.query(\`SELECT $\${input.length}\`, [1]);
      }
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /cannot statically determine SQL/u);
});

test("expands a static column list transformation used by runtime source", () => {
  const result = extractRuntimeSql({
    "packages/account/src/adapters/outbound/persistence/status.ts": `
      type Sql = { query(text: string): Promise<unknown> };
      const columns = "user_id,status,version";
      async function read(sql: Sql) {
        await sql.query(\`SELECT s.\${columns.split(",").join(",s.")} FROM user_statuses s\`);
      }
    `,
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.queries.map(({ sql }) => sql),
    ["SELECT s.user_id,s.status,s.version FROM user_statuses s"],
  );
});

test("specializes SQL passed through a local helper parameter", () => {
  const result = extractRuntimeSql({
    "packages/example/src/helper.ts": `
      type Sql = { query(text: string): Promise<unknown> };
      async function writeVersion(sql: Sql, text: string) {
        return sql.query(text);
      }
      declare const sql: Sql;
      void writeVersion(sql, "UPDATE organizations SET version=version+1");
      void writeVersion(sql, "INSERT INTO organizations(id) VALUES($1)");
    `,
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.queries.map(({ sql }) => sql).sort(), [
    "INSERT INTO organizations(id) VALUES($1)",
    "UPDATE organizations SET version=version+1",
  ]);
});

test("fails closed when a local SQL wrapper parameter is reassigned", () => {
  const result = extractRuntimeSql({
    "packages/example/src/mutated-wrapper.ts": `
      declare const sql: { query(text: string): Promise<unknown> };
      function run(text: string) {
        text = "SELECT id FROM users";
        return sql.query(text);
      }
      void run("SELECT id FROM wrapper_owned");
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /cannot statically determine SQL/u);
});

test("fails closed for destructured and compound writes in static SQL functions", () => {
  const result = extractRuntimeSql({
    "packages/example/src/mutated-static-function.ts": `
      declare const sql: { query(text: string): Promise<unknown> };
      function destructured(text: string) {
        ({ value: text } = { value: "UPDATE users SET status='paused'" });
        return text;
      }
      function compounded(text: string) {
        text += " FROM users";
        return text;
      }
      void sql.query(destructured("SELECT id FROM static_owned"));
      void sql.query(compounded("SELECT id"));
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.every((error) => /modified inside its function/u.test(error)));
});

test("does not treat local calls as complete for an exported SQL wrapper", () => {
  const result = extractRuntimeSql({
    "packages/provider/src/postgres.ts": `
      type Sql = { query(text: string): Promise<unknown> };
      declare const sql: Sql;
      export function run(sql: Sql, text: string) {
        return sql.query(text);
      }
      void run(sql, "SELECT id FROM provider_owned");
    `,
    "packages/consumer/src/use.ts": `
      import { run } from "@line_bot_v1/provider/postgres";
      declare const sql: { query(text: string): Promise<unknown> };
      void run(sql, "UPDATE users SET status='disabled'");
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /public SQL wrapper/u);
});

test("detects a SQL wrapper exported through an export list", () => {
  const result = extractRuntimeSql({
    "packages/provider/src/list-export.ts": `
      type Sql = { query(text: string): Promise<unknown> };
      declare const sql: Sql;
      function run(sql: Sql, text: string) {
        return sql.query(text);
      }
      export { run };
      void run(sql, "SELECT id FROM locally_known");
    `,
  });

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /public SQL wrapper/u);
});

test("continues to specialize a private SQL helper", () => {
  const result = extractRuntimeSql({
    "packages/provider/src/private.ts": `
      type Sql = { query(text: string): Promise<unknown> };
      declare const sql: Sql;
      function run(sql: Sql, text: string) {
        return sql.query(text);
      }
      void run(sql, "SELECT id FROM private_helper");
    `,
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.queries.map(({ sql: text }) => text),
    ["SELECT id FROM private_helper"],
  );
});

test("specializes a module-exported helper absent from package public entries", () => {
  const result = extractRuntimeSql(
    {
      "packages/provider/src/helper.ts": `
        type Sql = { query(text: string): Promise<unknown> };
        export function run(sql: Sql, text: string) {
          return sql.query(text);
        }
      `,
      "packages/provider/src/collaboration.ts": `
        import { run } from "./helper.js";
        declare const sql: { query(text: string): Promise<unknown> };
        void run(sql, "SELECT id FROM private_first");
        void run(sql, "SELECT id FROM private_second");
      `,
      "packages/provider/src/public.ts": `export const providerVersion = 1;`,
    },
    { publicEntryPoints: ["packages/provider/src/public.ts"] },
  );

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.queries.map(({ sql }) => sql).sort(), [
    "SELECT id FROM private_first",
    "SELECT id FROM private_second",
  ]);
});

test("fails closed when a package public entry reexports the SQL wrapper", () => {
  const result = extractRuntimeSql(
    {
      "packages/provider/src/helper.ts": `
        type Sql = { query(text: string): Promise<unknown> };
        export function run(sql: Sql, text: string) {
          return sql.query(text);
        }
      `,
      "packages/provider/src/collaboration.ts": `
        import { run } from "./helper.js";
        declare const sql: { query(text: string): Promise<unknown> };
        void run(sql, "SELECT id FROM locally_known");
      `,
      "packages/provider/src/public.ts": `export { run } from "./helper.js";`,
    },
    { publicEntryPoints: ["packages/provider/src/public.ts"] },
  );

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /public SQL wrapper/u);
});

test("resolves public reexports across mts, cts, and jsx source variants", () => {
  for (const fixture of [
    {
      entry: "packages/provider/src/index.mts",
      helper: "packages/provider/src/helper.mts",
      specifier: "./helper.mjs",
    },
    {
      entry: "packages/provider/src/index.cts",
      helper: "packages/provider/src/helper.cts",
      specifier: "./helper.cjs",
    },
    {
      entry: "packages/provider/src/index.jsx",
      helper: "packages/provider/src/helper.jsx",
      specifier: "./helper.js",
    },
  ]) {
    const result = extractRuntimeSql(
      {
        [fixture.helper]: `
          const database = /** @type {{query(text: string): Promise<unknown>}} */ (globalThis.db);
          export function run(text) { return database.query(text); }
          void run("SELECT id FROM locally_known");
        `,
        [fixture.entry]: `export { run } from "${fixture.specifier}";`,
      },
      { publicEntryPoints: [fixture.entry] },
    );
    assert.equal(result.queries.length, 0, fixture.entry);
    assert.equal(result.errors.length, 1, fixture.entry);
    assert.match(result.errors[0], /public SQL wrapper/u);
  }
});

test("fails when a package public reexport cannot be resolved", () => {
  const result = extractRuntimeSql(
    {
      "packages/provider/src/index.ts": `export { run } from "./missing.js";`,
    },
    { publicEntryPoints: ["packages/provider/src/index.ts"] },
  );

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /cannot resolve reexport/u);
});

test("ignores erased type-only external reexports in runtime public entries", () => {
  const result = extractRuntimeSql(
    {
      "packages/provider/src/index.ts": `
        export type { ExternalContract } from "@external/contracts";
        export { type AnotherContract } from "@external/other-contracts";
      `,
    },
    { publicEntryPoints: ["packages/provider/src/index.ts"] },
  );

  assert.deepEqual(result, { queries: [], errors: [], forwarded: [] });
});

test("follows namespace reexports from a package public entry", () => {
  const result = extractRuntimeSql(
    {
      "packages/provider/src/helper.ts": `
        type Sql = { query(text: string): Promise<unknown> };
        declare const sql: Sql;
        export function run(text: string) { return sql.query(text); }
        void run("SELECT id FROM locally_known");
      `,
      "packages/provider/src/index.ts": `export * as db from "./helper.js";`,
    },
    { publicEntryPoints: ["packages/provider/src/index.ts"] },
  );

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /public SQL wrapper/u);
});

test("reports a missing declared package public entry", () => {
  const result = extractRuntimeSql(
    { "packages/provider/src/helper.ts": `export const value = 1;` },
    { publicEntryPoints: ["packages/provider/src/missing.ts"] },
  );

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /public entry point .*not present/u);
});

test("finds a SQL wrapper nested in an exported public object", () => {
  const result = extractRuntimeSql(
    {
      "packages/provider/src/public.ts": `
        type Sql = { query(text: string): Promise<unknown> };
        declare const sql: Sql;
        function run(sql: Sql, text: string) {
          return sql.query(text);
        }
        export const api = { run };
        void run(sql, "SELECT id FROM locally_known");
      `,
    },
    { publicEntryPoints: ["packages/provider/src/public.ts"] },
  );

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /public SQL wrapper/u);
});

test("finds a SQL wrapper placed in an exported public array", () => {
  const result = extractRuntimeSql(
    {
      "packages/provider/src/public.ts": `
        type Sql = { query(text: string): Promise<unknown> };
        declare const sql: Sql;
        function run(text: string) { return sql.query(text); }
        void run("SELECT id FROM locally_known");
        export const handlers = [run];
      `,
    },
    { publicEntryPoints: ["packages/provider/src/public.ts"] },
  );

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /public SQL wrapper/u);
});

test("finds SQL methods exposed by a public class instance", () => {
  const result = extractRuntimeSql(
    {
      "packages/provider/src/public.ts": `
        type Sql = { query(text: string): Promise<unknown> };
        declare const sql: Sql;
        class Service {
          run(text: string) { return sql.query(text); }
        }
        const local = new Service();
        void local.run("SELECT id FROM locally_known");
        export const service = new Service();
      `,
    },
    { publicEntryPoints: ["packages/provider/src/public.ts"] },
  );

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /public SQL wrapper/u);
});

test("finds SQL methods returned through a public factory", () => {
  const result = extractRuntimeSql(
    {
      "packages/provider/src/public.ts": `
        type Sql = { query(text: string): Promise<unknown> };
        declare const sql: Sql;
        class Service {
          run(text: string) { return sql.query(text); }
        }
        export function serviceFactory() { return new Service(); }
        void new Service().run("SELECT id FROM locally_known");
      `,
    },
    { publicEntryPoints: ["packages/provider/src/public.ts"] },
  );

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /public SQL wrapper/u);
});

test("fails closed for arbitrary dynamic SQL and succeeds after a finite repair", () => {
  const violating = extractRuntimeSql({
    "packages/example/src/violating.ts": `
      type Sql = { query(text: string): Promise<unknown> };
      async function run(sql: Sql, table: string) {
        await sql.query(\`SELECT * FROM \${table}\`);
      }
    `,
  });
  assert.equal(violating.queries.length, 0);
  assert.equal(violating.errors.length, 1);
  assert.match(violating.errors[0], /cannot statically determine SQL/u);

  const repaired = extractRuntimeSql({
    "packages/example/src/repaired.ts": `
      type Sql = { query(text: string): Promise<unknown> };
      async function run(sql: Sql, archived: boolean) {
        const table = archived ? "archived_accounts" : "accounts";
        await sql.query(\`SELECT * FROM \${table}\`);
      }
    `,
  });
  assert.deepEqual(repaired.errors, []);
  assert.deepEqual(repaired.queries.map(({ sql }) => sql).sort(), [
    "SELECT * FROM accounts",
    "SELECT * FROM archived_accounts",
  ]);
});

test("records createSql transport forwarding without treating it as business SQL", () => {
  const sources = {
    "packages/platform/src/database/postgres/database.ts": `
      type SqlRow = Record<string, unknown>;
      interface Sql { query(text: string, values?: unknown[]): Promise<unknown> }
      export declare function createSql(
        execute: (text: string, values?: unknown[]) => Promise<unknown>,
      ): Sql;
      declare const client: {
        query<Row extends object>(text: string, values?: unknown[]): Promise<unknown>;
      };
      const sql = createSql(async (text, values) => {
        await client.query("SET LOCAL ROLE line_app");
        return client.query<SqlRow>(text, values);
      });
    `,
    "packages/platform/src/postgres.ts": `
      export { createSql } from "./database/postgres/database.js";
    `,
  };
  const unauthorized = extractRuntimeSql(sources);
  assert.equal(unauthorized.forwarded.length, 0);
  assert.equal(unauthorized.errors.length, 1);

  const result = extractRuntimeSql(sources, {
    isForwardedQuery: ({ path, sqlTransportFactory }) =>
      path === "packages/platform/src/database/postgres/database.ts" &&
      sqlTransportFactory?.path === "packages/platform/src/database/postgres/database.ts" &&
      sqlTransportFactory.name === "createSql" &&
      sqlTransportFactory.exported &&
      sqlTransportFactory.returnsSql &&
      sqlTransportFactory.publicContract,
    sqlTransportContracts: [{ path: "packages/platform/src/postgres.ts", exportName: "createSql" }],
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.queries.map(({ sql }) => sql),
    ["SET LOCAL ROLE line_app"],
  );
  assert.equal(result.forwarded.length, 1);
  assert.match(result.forwarded[0].reason, /transport/u);
});

test("does not trust an exported sibling factory absent from the public contract", () => {
  const result = extractRuntimeSql(
    {
      "packages/platform/src/database/postgres/database.ts": `
        export interface Sql { query(text: string): Promise<unknown> }
        export declare function createSql(
          execute: (text: string) => Promise<unknown>,
        ): Sql;
      `,
      "packages/platform/src/postgres.ts": `
        export { createSql } from "./database/postgres/database.js";
      `,
      "packages/platform/src/counterfeit.ts": `
        interface Sql { query(text: string): Promise<unknown> }
        export declare function createSql(
          execute: (text: string) => Promise<unknown>,
        ): Sql;
        declare const client: { query(text: string): Promise<unknown> };
        createSql(async (text) => client.query(text));
      `,
    },
    {
      isForwardedQuery: ({ sqlTransportFactory }) => sqlTransportFactory?.publicContract === true,
      sqlTransportContracts: [
        { path: "packages/platform/src/postgres.ts", exportName: "createSql" },
      ],
    },
  );

  assert.equal(result.forwarded.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /cannot statically determine SQL/u);
});

test("rejects transport forwarding when the callback query parameter is reassigned", () => {
  const result = extractRuntimeSql(
    {
      "packages/platform/src/database.ts": `
        export interface Sql { query(text: string): Promise<unknown> }
        export declare function createSql(
          execute: (text: string) => Promise<unknown>,
        ): Sql;
        declare const client: { query(text: string): Promise<unknown> };
        createSql(async (text) => {
          text = "UPDATE users SET status='paused'";
          return client.query(text);
        });
      `,
      "packages/platform/src/postgres.ts": `export { createSql } from "./database.js";`,
    },
    {
      isForwardedQuery: ({ sqlTransportFactory }) => sqlTransportFactory?.publicContract === true,
      sqlTransportContracts: [
        { path: "packages/platform/src/postgres.ts", exportName: "createSql" },
      ],
    },
  );

  assert.equal(result.forwarded.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /cannot statically determine SQL/u);
});

test("rejects compound and destructuring writes to a transport query parameter", () => {
  const result = extractRuntimeSql(
    {
      "packages/platform/src/database.ts": `
        export interface Sql { query(text: string): Promise<unknown> }
        export declare function createSql(
          execute: (text: string) => Promise<unknown>,
        ): Sql;
        declare const client: { query(text: string): Promise<unknown> };
        declare const suffix: string;
        declare const source: { text: string };
        createSql(async (text) => {
          text += suffix;
          return client.query(text);
        });
        createSql(async (text) => {
          ({ text } = source);
          return client.query(text);
        });
      `,
      "packages/platform/src/postgres.ts": `export { createSql } from "./database.js";`,
    },
    {
      isForwardedQuery: ({ sqlTransportFactory }) => sqlTransportFactory?.publicContract === true,
      sqlTransportContracts: [
        { path: "packages/platform/src/postgres.ts", exportName: "createSql" },
      ],
    },
  );

  assert.equal(result.forwarded.length, 0);
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.every((error) => /cannot statically determine SQL/u.test(error)));
});

test("an exported support forwarder is not a Sql transport factory callback", () => {
  const result = extractRuntimeSql(
    {
      "packages/platform/src/forward.ts": `
        export async function forward(
          database: { query(text: string): Promise<unknown> },
          text: string,
        ) {
          return database.query(text);
        }
      `,
    },
    {
      isForwardedQuery: ({ sqlTransportFactory }) => Boolean(sqlTransportFactory),
    },
  );

  assert.equal(result.forwarded.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /cannot statically determine SQL/u);
});

test("forwarding context distinguishes a direct parameter from dynamic composition", () => {
  const result = extractRuntimeSql(
    {
      "packages/platform/src/transport.ts": `
        declare const database: { query(text: string): Promise<unknown> };
        async function execute(prefix: string, runtimeTable: string) {
          return database.query(\`\${prefix} FROM \${runtimeTable}\`);
        }
      `,
    },
    { isForwardedQuery: ({ argumentIsParameter }) => argumentIsParameter },
  );

  assert.equal(result.forwarded.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /cannot statically determine SQL/u);
});

test("does not let forwarding authorization hide statically known SQL", () => {
  const result = extractRuntimeSql(
    {
      "packages/platform/src/transport.ts": `
        declare const database: { query(text: string): Promise<unknown> };
        void database.query("SELECT id FROM known_transport_query");
      `,
    },
    { isForwardedQuery: () => true },
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.forwarded.length, 0);
  assert.deepEqual(
    result.queries.map(({ sql }) => sql),
    ["SELECT id FROM known_transport_query"],
  );
});

test("a business function named createSql cannot self-authorize dynamic forwarding", () => {
  const result = extractRuntimeSql({
    "packages/example/src/business.ts": `
      declare function createSql(work: (text: string) => Promise<unknown>): unknown;
      declare const database: { query(text: string): Promise<unknown> };
      createSql(async (text) => database.query(text));
    `,
  });

  assert.equal(result.forwarded.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /cannot statically determine SQL/u);
});

test("bounds finite expansion", () => {
  const result = extractRuntimeSql(
    {
      "packages/example/src/bounded.ts": `
        type Sql = { query(text: string): Promise<unknown> };
        async function run(sql: Sql, a: boolean, b: boolean) {
          await sql.query((a ? "SELECT 1" : "SELECT 2") + (b ? "" : " FOR UPDATE"));
        }
      `,
    },
    { maxAlternatives: 3 },
  );

  assert.equal(result.queries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /exceeds 3 alternatives/u);
});

test("reports source parse failures separately from SQL analysis", () => {
  const result = extractRuntimeSql({
    "packages/example/src/broken.ts": `
      type Sql = { query(text: string): Promise<unknown> };
      async function broken(sql: Sql) {
        await sql.query("SELECT id FROM accounts");
    `,
  });

  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /TypeScript parse failure/u);
});

test("parses TSX sources with the matching script kind", () => {
  const result = extractRuntimeSql({
    "apps/web/src/component.tsx": `
      declare namespace JSX { interface IntrinsicElements { div: unknown } }
      declare const database: { query(text: string): Promise<unknown> };
      const view = <div />;
      void database["query"]("SELECT id FROM tsx_accounts");
    `,
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.queries.map(({ sql }) => sql),
    ["SELECT id FROM tsx_accounts"],
  );
});
