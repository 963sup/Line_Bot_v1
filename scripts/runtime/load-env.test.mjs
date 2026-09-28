import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { repositoryRoot } from "./load-env.mjs";

const loader = new URL("./load-env.mjs", import.meta.url).href;

function fixture(run) {
  const base = join(repositoryRoot, ".artifacts");
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, "env-test-"));
  mkdirSync(join(root, "apps", "web"), { recursive: true });
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function probe(root, overrides = {}, cwd = root) {
  // No real environment/credentials are inherited by these child processes.
  const env = { SystemRoot: process.env.SystemRoot ?? "", ...overrides };
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { loadRootEnv } from ${JSON.stringify(loader)};
     loadRootEnv(${JSON.stringify(root)});
     console.log(JSON.stringify({ value: process.env.ENV_TEST_VALUE ?? null }));`,
    ],
    { cwd, env, encoding: "utf8" },
  );
}

test("root configuration loads independently of cwd; shell values win", () =>
  fixture((root) => {
    writeFileSync(join(root, ".env.local"), 'ENV_TEST_VALUE="local fixture"\n');
    const local = probe(root, {}, join(root, "apps", "web"));
    assert.equal(local.status, 0, local.stderr);
    assert.equal(JSON.parse(local.stdout).value, "local fixture");
    const shell = probe(root, { ENV_TEST_VALUE: "shell fixture" });
    assert.equal(shell.status, 0, shell.stderr);
    assert.equal(JSON.parse(shell.stdout).value, "shell fixture");
  }));

test("missing local file is allowed; test and Vercel never load local values", () =>
  fixture((root) => {
    const missing = probe(root);
    assert.equal(missing.status, 0, missing.stderr);
    assert.equal(JSON.parse(missing.stdout).value, null);
    writeFileSync(join(root, ".env.local"), "ENV_TEST_VALUE=local-fixture\n");
    for (const env of [{ NODE_ENV: "test" }, { VERCEL: "1" }]) {
      const result = probe(root, env);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).value, null);
    }
  }));

test("competing dotenv sources and duplicate names fail without revealing values", () =>
  fixture((root) => {
    const nested = join(root, "apps", "web", ".env.local");
    writeFileSync(nested, "ENV_TEST_VALUE=private-fixture\n");
    let result = probe(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Keep environment files only/);
    assert.doesNotMatch(result.stderr, /private-fixture/);
    rmSync(nested);
    writeFileSync(
      join(root, ".env.local"),
      "ENV_TEST_VALUE=private-fixture\nENV_TEST_VALUE=other-private\n",
    );
    result = probe(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Duplicate environment variable/);
    assert.doesNotMatch(result.stderr, /private-fixture|other-private/);
  }));
