import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePostgresConnectionUrl } from "../src/database/postgres/connection.js";
import { PostgresDatabase } from "../src/database/postgres/database.js";

const providerUrl =
  "postgresql://postgres.project:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require&workaround=supabase-pooler.vercel";

test("provider Postgres URL keeps provider parameters but delegates effective TLS to platform", () => {
  const normalized = new URL(normalizePostgresConnectionUrl(providerUrl, true));
  assert.equal(normalized.hostname, "aws-0-ap-south-1.pooler.supabase.com");
  assert.equal(normalized.port, "6543");
  assert.equal(normalized.searchParams.has("sslmode"), false);
  assert.equal(normalized.searchParams.get("workaround"), "supabase-pooler.vercel");

  for (const mode of ["require", "verify-ca", "verify-full"]) {
    assert.doesNotThrow(() =>
      normalizePostgresConnectionUrl(
        providerUrl.replace("sslmode=require", `sslmode=${mode}`),
        true,
      ),
    );
  }
});

test("provider Postgres URL rejects TLS downgrade and independent TLS material", () => {
  for (const mode of ["disable", "allow", "prefer"]) {
    assert.throws(
      () =>
        normalizePostgresConnectionUrl(
          providerUrl.replace("sslmode=require", `sslmode=${mode}`),
          true,
        ),
      /configure_ssl_with_server_environment/,
    );
  }
  assert.throws(
    () => normalizePostgresConnectionUrl(`${providerUrl}&sslrootcert=other-ca.pem`, true),
    /configure_ssl_with_server_environment/,
  );
});

test("Vercel runtime requires Supavisor transaction mode", async () => {
  for (const invalid of [
    "postgresql://postgres.project:secret@db.example.supabase.co:5432/postgres",
    "postgresql://postgres.project:secret@aws-0-ap-south-1.pooler.supabase.com:5432/postgres",
  ]) {
    assert.throws(
      () => normalizePostgresConnectionUrl(invalid, true),
      /supabase_database_pooler_required/,
    );
  }

  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  try {
    const database = new PostgresDatabase(providerUrl);
    await database.close();
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});
