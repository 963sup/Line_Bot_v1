import assert from "node:assert/strict";
import test from "node:test";
import { postgresConfig, supabaseCaFromSource } from "./postgres.mjs";

test("Supabase CA parser preserves the platform-owned certificate source", () => {
  assert.equal(
    supabaseCaFromSource(
      'export const supabaseCa = "-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----\\n";',
    ),
    "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\n",
  );
  assert.throws(() => supabaseCaFromSource("export const other = 1;"), /Supabase root CA/);
});

test("remote PostgreSQL config verifies the provider certificate", () => {
  const config = postgresConfig(
    "postgresql://postgres.example:secret@pooler.supabase.com:5432/postgres?sslmode=require",
    { remote: true },
  );
  assert.equal(config.host, "pooler.supabase.com");
  assert.equal(config.port, 5432);
  assert.equal(config.user, "postgres.example");
  assert.equal(config.password, "secret");
  assert.equal(config.database, "postgres");
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.match(config.ssl.ca, /BEGIN CERTIFICATE/);
});

test("local PostgreSQL config disables TLS only for local development", () => {
  const config = postgresConfig("postgresql://postgres:postgres@127.0.0.1:54322/postgres", {
    remote: false,
  });
  assert.equal(config.ssl, false);
});
