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
const retiredPaths = [
  ...retiredNames.map((name) => `docs/change/proposals/${name}`),
  ...owners.flatMap((owner) =>
    ["AGENTS.md", "README.md", "SEMANTICS.md"].map((name) => `packages/${owner}/${name}`),
  ),
];

// Retired design must not become current guidance again through generation or copy/paste.
// Updating documentation after source review requires an intentional update to this guard.
test("retired document-owner plans and package guidance stay removed", () => {
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

test("document-owner pages only route to manifest, source and tests until source review", () => {
  for (const owner of owners) {
    const route = `docs/owners/${owner}.md`;
    const allowed = new Set([
      `../../packages/${owner}/package.json`,
      `../../packages/${owner}/src/`,
      `../../packages/${owner}/test/`,
    ]);
    const lines = readFileSync(resolve(root, route), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (/^# [\w]+ source$/.test(line)) continue;
      const link = /^- \[[^\]]+\]\(([^)]+)\)$/.exec(line);
      assert.ok(
        link && allowed.has(link[1]),
        `${route}: design prose must wait for source review.`,
      );
    }
    for (const path of allowed)
      assert.ok(
        existsSync(resolve(root, dirname(route), path)),
        `${route}: missing source target ${path}`,
      );
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
