import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const owners = ["file", "intelligence", "contract", "content", "wbs"];
const retiredPaths = [
  "architecture/AGENTS.md",
  "architecture/README.md",
  ...["semantic-model", "implementation-topology", "data-topology"].map(
    (name) => `architecture/${name}.json`,
  ),
];

// Basic owner documentation is explicitly allowed; the retired proposal series remains blocked.
test("retired proposals and aggregate architecture sources stay removed", () => {
  const restored = retiredPaths.filter((path) =>
    lstatSync(resolve(root, path), { throwIfNoEntry: false }),
  );
  assert.deepEqual(
    restored,
    [],
    "Retired sources were restored; use registered architecture fragments.",
  );
});

test("all five owners have basic documentation with valid local source links", () => {
  const pages = owners.flatMap((owner) => [
    ...["AGENTS.md", "README.md", "SEMANTICS.md"].map((name) => `packages/${owner}/${name}`),
    `docs/owners/${owner}.md`,
  ]);
  for (const page of pages) {
    assert.ok(existsSync(resolve(root, page)), `Missing basic documentation: ${page}`);
    const content = readFileSync(resolve(root, page), "utf8");
    assert.ok(content.trim().length > 0, `Empty documentation: ${page}`);
    for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const raw = match[1].replace(/^<|>$/g, "").split("#")[0];
      if (!raw || /^[a-z][a-z\d+.-]*:/i.test(raw)) continue;
      assert.ok(
        existsSync(resolve(root, dirname(page), decodeURIComponent(raw))),
        `${page}: missing link ${raw}`,
      );
    }
  }
});

test("tracked Markdown never links back to retired design", () => {
  const retired = new Set(retiredPaths.map((path) => resolve(root, path)));
  const files = execFileSync("git", ["ls-files", "-z", "--", "*.md"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  const staleLinks = [];
  for (const file of files) {
    const absolute = resolve(root, file);
    if (!existsSync(absolute)) continue;
    const content = readFileSync(absolute, "utf8");
    for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const raw = match[1].replace(/^<|>$/g, "").split("#")[0];
      if (!raw || /^[a-z][a-z\d+.-]*:/i.test(raw)) continue;
      const target = decodeURIComponent(raw);
      if (retired.has(resolve(dirname(absolute), target))) staleLinks.push(`${file} -> ${target}`);
    }
  }
  assert.deepEqual(staleLinks, [], "Remove inbound links when retiring design Markdown.");
});
