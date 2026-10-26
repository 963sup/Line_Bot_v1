import assert from "node:assert/strict";
import test from "node:test";
import {
  assertConfirmedProject,
  assertRemoteTarget,
  projectRefFromSupabaseUrl,
} from "./remote-target.mjs";

const projectRef = "nmssogphayjymjpbnrxv";
const supabaseUrl = `https://${projectRef}.supabase.co`;

test("Supabase project URL yields the exact project ref", () => {
  assert.equal(projectRefFromSupabaseUrl(supabaseUrl), projectRef);
  assert.throws(() => projectRefFromSupabaseUrl("https://example.com"), /SUPABASE_URL/);
});

test("explicit project confirmation is mandatory and must match the URL-derived target", () => {
  assert.doesNotThrow(() => assertConfirmedProject(projectRef, projectRef));
  assert.throws(() => assertConfirmedProject(projectRef, undefined), /exactly match/);
  assert.throws(() => assertConfirmedProject(projectRef, "aaaaaaaaaaaaaaaaaaaa"), /exactly match/);
});

test("remote target guard accepts direct and session-pooler URLs for the exact project", () => {
  for (const url of [
    `postgresql://postgres:secret@db.${projectRef}.supabase.co:5432/postgres`,
    `postgresql://postgres.${projectRef}:secret@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
  ]) {
    assert.equal(assertRemoteTarget(supabaseUrl, url), projectRef);
  }
});

test("remote target guard rejects wrong project, database, and transaction pooler", () => {
  assert.throws(
    () =>
      assertRemoteTarget(
        supabaseUrl,
        "postgresql://postgres:secret@db.aaaaaaaaaaaaaaaaaaaa.supabase.co:5432/postgres",
      ),
    /does not target/,
  );
  assert.throws(
    () =>
      assertRemoteTarget(
        supabaseUrl,
        `postgresql://postgres:secret@db.${projectRef}.supabase.co:5432/other`,
      ),
    /postgres database/,
  );
  assert.throws(
    () =>
      assertRemoteTarget(
        supabaseUrl,
        `postgresql://postgres.${projectRef}:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
      ),
    /transaction pooler/,
  );
});
