import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("frontmatter regex is not a link; prose links and incomplete metadata still fail", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "docs-frontmatter-"));
  try {
    const source = await readFile(new URL("./check-docs.mjs", import.meta.url), "utf8");
    const fixed = [
      "README.md",
      "AGENTS.md",
      "supabase/AGENTS.md",
      ...["app", "modules", "shared"].map((name) => `apps/web/src/${name}/AGENTS.md`),
      ...["contracts", "domain", "infrastructure", "agents", "application"].map(
        (name) => `packages/${name}/AGENTS.md`,
      ),
    ];
    for (const file of fixed) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), "# Fixture\n");
    }
    for (const dir of ["scripts/docs", "docs", ".agents/skills"])
      await mkdir(path.join(root, dir), { recursive: true });
    const script = path.join(root, "scripts/docs/check-docs.mjs");
    await writeFile(script, source);
    const fixture = path.join(root, "docs/010-fixture.md");
    for (const [body, status, message] of [
      ["---\npattern: '[x](not-a-link)'\n---\n[real](../README.md)\n", 0, "Docs OK"],
      [
        "---\npattern: '[x](not-a-link)'\n---\n[broken](missing.md)\n",
        1,
        "missing local link missing.md",
      ],
      ["---\nname: incomplete\n", 1, "unclosed frontmatter"],
      ["---\n<<<<<<< branch\n---\n", 1, "conflict marker"],
    ]) {
      await writeFile(fixture, body);
      const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
      assert.equal(result.status, status, result.stderr);
      assert.ok(`${result.stdout}${result.stderr}`.includes(message));
    }
    await writeFile(fixture, "# Valid\n");
    const invalidName = path.join(root, "docs/workforce.md");
    await writeFile(invalidName, "# Invalid name\n");
    const invalidNameResult = spawnSync(process.execPath, [script], { encoding: "utf8" });
    assert.equal(invalidNameResult.status, 1);
    assert.match(
      invalidNameResult.stderr,
      /docs content file must use 010-name\.md interval numbering/,
    );
    await rm(invalidName);

    const moduleReadme = path.join(root, "packages/domain/README.md");
    await writeFile(moduleReadme, "[broken](missing.md)\n");
    const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing local link missing.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
