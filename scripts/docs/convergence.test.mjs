import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "convergence-"));
  await mkdir(path.join(root, "scripts/docs"), { recursive: true });
  await mkdir(path.join(root, "docs"), { recursive: true });
  await mkdir(path.join(root, ".agents/skills/demo"), { recursive: true });
  const source = await readFile(new URL("./convergence.mjs", import.meta.url), "utf8");
  await writeFile(path.join(root, "scripts/docs/convergence.mjs"), source);
  await writeFile(
    path.join(root, "docs/convergence-manifest.json"),
    `${JSON.stringify({ version: 1, phase: "in-progress", files: {}, upstreamSkills: {} }, null, 2)}\n`,
  );
  await writeFile(
    path.join(root, "skills-lock.json"),
    `${JSON.stringify(
      {
        version: 1,
        skills: {
          demo: {
            source: "example/demo",
            ref: "main",
            sourceType: "github",
            skillPath: "SKILL.md",
            computedHash: "abc123",
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(path.join(root, "README.md"), "# Fixture\n");
  await writeFile(path.join(root, ".agents/skills/demo/SKILL.md"), "# Demo\n");
  return root;
}

function run(root, ...args) {
  return spawnSync(process.execPath, [path.join(root, "scripts/docs/convergence.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("in-progress status allows pending work but complete gate does not", async () => {
  const root = await fixture();
  try {
    const status = run(root, "status");
    assert.equal(status.status, 0, status.stderr);
    assert.match(status.stdout, /unresolved: 2/);
    const complete = run(root, "complete");
    assert.equal(complete.status, 1);
    assert.match(complete.stderr, /convergence incomplete/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("begin and record preserve byte monotonicity and source freshness", async () => {
  const root = await fixture();
  try {
    assert.equal(run(root, "begin", "README.md").status, 0);
    await writeFile(path.join(root, "README.md"), "# F\n");
    const record = run(root, "record", "README.md", "distilled", "--source", "skills-lock.json");
    assert.equal(record.status, 0, record.stderr);
    assert.match(run(root, "status").stdout, /"reviewed":1/);

    await writeFile(
      path.join(root, "skills-lock.json"),
      `${JSON.stringify(
        {
          version: 1,
          skills: {
            demo: {
              source: "example/demo",
              ref: "main",
              sourceType: "github",
              skillPath: "SKILL.md",
              computedHash: "changed",
            },
          },
        },
        null,
        2,
      )}\n`,
    );
    assert.match(run(root, "status").stdout, /"stale":1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("record rejects growth and imported corpus uses review-skill", async () => {
  const root = await fixture();
  try {
    assert.equal(run(root, "begin", "README.md").status, 0);
    await writeFile(path.join(root, "README.md"), "# Fixture expanded\n");
    const grown = run(root, "record", "README.md", "updated");
    assert.equal(grown.status, 1);
    assert.match(grown.stderr, /exceeds review baseline/);

    const imported = run(root, "begin", ".agents/skills/demo/SKILL.md");
    assert.equal(imported.status, 1);
    assert.match(imported.stderr, /Use review-skill/);

    assert.equal(run(root, "review-skill", "demo", "keep").status, 0);
    assert.match(run(root, "status").stdout, /"upstream-reviewed":1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("review becomes stale when reviewed Markdown changes", async () => {
  const root = await fixture();
  try {
    assert.equal(run(root, "begin", "README.md").status, 0);
    assert.equal(run(root, "record", "README.md", "keep").status, 0);
    await writeFile(path.join(root, "README.md"), "# Changed\n");
    assert.match(run(root, "status").stdout, /"stale":1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("seal requires zero unresolved work and makes future pending work fail closed", async () => {
  const root = await fixture();
  try {
    assert.equal(run(root, "begin", "README.md").status, 0);
    assert.equal(run(root, "record", "README.md", "keep").status, 0);
    assert.equal(run(root, "review-skill", "demo", "keep").status, 0);
    const seal = run(root, "seal");
    assert.equal(seal.status, 0, seal.stderr);
    assert.match(seal.stdout, /phase=complete/);

    await writeFile(path.join(root, "NEW.md"), "# New\n");
    const status = run(root, "check");
    assert.equal(status.status, 1);
    assert.match(status.stderr, /convergence incomplete/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retire closes deleted review state without storing history", async () => {
  const root = await fixture();
  try {
    assert.equal(run(root, "begin", "README.md").status, 0);
    await rm(path.join(root, "README.md"));
    const retire = run(root, "retire", "README.md", "deleted");
    assert.equal(retire.status, 0, retire.stderr);
    const manifest = JSON.parse(
      await readFile(path.join(root, "docs/convergence-manifest.json"), "utf8"),
    );
    assert.equal(manifest.files["README.md"], undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
