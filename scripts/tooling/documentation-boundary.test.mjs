import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const owners = ["file", "intelligence", "contract", "content", "wbs"];
const retiredNames = [
  "platform-integration-root-migration-step-start.md",
  ...Array.from(
    { length: 8 },
    (_, index) => `platform-integration-root-migration-step-${index + 1}.md`,
  ),
  "platform-integration-root-migration-step-end.md",
  ...Array.from(
    { length: 7 },
    (_, index) => `document-owner-skeleton-reduction-step-${index + 1}.md`,
  ),
];
const retiredPaths = [...retiredNames.map((name) => `docs/change/proposals/${name}`)];

// Basic owner documentation is explicitly allowed; the retired proposal series remains blocked.
test("retired document-owner proposals stay removed", () => {
  const restored = retiredPaths.filter((path) =>
    lstatSync(resolve(root, path), { throwIfNoEntry: false }),
  );
  assert.deepEqual(
    restored,
    [],
    "Retired Markdown was restored; review source structure before reintroducing guidance.",
  );
  const obsoleteSeries = readdirSync(resolve(root, "docs/change/proposals")).filter((name) =>
    /^(?:platform-integration-root-migration-step-(?:start|end|\d+)|document-owner-skeleton-reduction-step-\d+)\.md$/.test(
      name,
    ),
  );
  assert.deepEqual(
    obsoleteSeries,
    [],
    "Do not recreate the retired proposal series under another step number.",
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
