import assert from "node:assert/strict";
import test from "node:test";
import { assertImportTarget, requireReleasedImports } from "./imports.mjs";

test("Import target independently binds Supabase identity, confirmed production project and database connection", () => {
  const project = "nmssogphayjymjpbnrxv";
  const correct = {
    supabaseUrl: `https://${project}.supabase.co`,
    postgresUrl: `postgresql://postgres:synthetic@db.${project}.supabase.co:5432/postgres`,
    confirmedProject: project,
  };
  assert.equal(assertImportTarget(correct), project);
  assert.throws(
    () =>
      assertImportTarget({
        ...correct,
        postgresUrl:
          "postgresql://postgres:synthetic@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
      }),
    /does not target/,
  );
  assert.throws(
    () => assertImportTarget({ ...correct, confirmedProject: undefined }),
    /exactly match/,
  );
  assert.throws(
    () => assertImportTarget({ ...correct, confirmedProject: "abcdefghijklmnopqrst" }),
    /exactly match/,
  );
  assert.throws(
    () =>
      assertImportTarget({ ...correct, supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co" }),
    /does not target/,
  );
});

test("Import worker requires current main, completed successful Release and exact runtime evidence", async () => {
  const sha = "a".repeat(40);
  const release = {
    id: 1,
    path: ".github/workflows/release.yml",
    head_sha: sha,
    head_branch: "main",
    event: "push",
    status: "completed",
    conclusion: "success",
  };
  let runs = [release];
  let current = sha;
  let jobs = [
    "release_plan",
    "validation / validate",
    "supabase",
    "deployment",
    "identifier_runtime_activation",
  ].map((name) => ({ name, conclusion: "success" }));
  const fetchImpl = async (url) =>
    new Response(
      JSON.stringify(
        url.endsWith("branches/main")
          ? { commit: { sha: current } }
          : url.includes("/jobs?")
            ? { jobs }
            : { workflow_runs: runs },
      ),
      { status: 200 },
    );
  const verify = () =>
    requireReleasedImports({
      sha,
      repository: "963sup/Line_Bot_v1",
      token: "synthetic",
      fetchImpl,
    });
  assert.equal(await verify(), true);
  jobs = jobs.map((job) =>
    ["deployment", "identifier_runtime_activation", "supabase"].includes(job.name)
      ? { ...job, conclusion: "skipped" }
      : job,
  );
  assert.equal(
    await verify(),
    true,
    "an unchanged-runtime documentation Release must not stop existing imports",
  );
  jobs = jobs.map((job) => ({ ...job, conclusion: "success" }));
  jobs = jobs.filter((job) => job.name !== "identifier_runtime_activation");
  assert.equal(await verify(), false);
  runs = [{ ...release, status: "in_progress" }];
  assert.equal(await verify(), false);
  runs = [{ ...release, head_sha: "b".repeat(40) }];
  assert.equal(await verify(), false);
  current = "b".repeat(40);
  await assert.rejects(verify(), /not current main/);
});
