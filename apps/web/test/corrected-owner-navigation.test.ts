import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  repositoryContentPath,
  repositoryContractsPath,
  repositoryExecutionsPath,
  repositoryResourceNavigationItems,
  repositoryResourcesPath,
} from "../src/modules/repository/resource-navigation";

test("repository navigation exposes corrected owners and keeps Objects clearly legacy", () => {
  const items = repositoryResourceNavigationItems("Owner", "Repo", false);
  assert.deepEqual(
    items
      .filter((item) => ["content", "resources", "contracts", "executions"].includes(item.section))
      .map((item) => [item.section, item.href]),
    [
      ["content", repositoryContentPath("Owner", "Repo")],
      ["resources", repositoryResourcesPath("Owner", "Repo")],
      ["contracts", repositoryContractsPath("Owner", "Repo")],
      ["executions", repositoryExecutionsPath("Owner", "Repo")],
    ],
  );
  assert.deepEqual(
    items.find((item) => item.section === "objects"),
    {
      href: "/Owner/Repo/objects",
      label: "Objects (Legacy)",
      section: "objects",
    },
  );
});

test("Repository Overview presents current delivery owners and separates legacy Objects", () => {
  const source = readFileSync(
    new URL("../src/modules/repository/repository-overview-panel.tsx", import.meta.url),
    "utf8",
  );

  for (const [title, pathHelper] of [
    ["Content", "repositoryContentPath"],
    ["Resources", "repositoryResourcesPath"],
    ["Contracts", "repositoryContractsPath"],
    ["Executions", "repositoryExecutionsPath"],
  ]) {
    assert.match(
      source,
      new RegExp(`href=\\{${pathHelper}\\(baseOwner, baseName\\)\\}[\\s\\S]*?title="${title}"`),
    );
  }
  assert.match(source, /<h2 id="repository-delivery-heading">工作交付<\/h2>/);
  assert.match(source, /<h2 id="repository-legacy-heading">Legacy<\/h2>/);
  assert.match(
    source,
    /href=\{repositoryObjectsPath\(baseOwner, baseName\)\}[\s\S]*?title="Objects \(Legacy\)"/,
  );
  assert.doesNotMatch(source, /title="Objects"/);
  assert.match(source, /<ActionRow href="\/projects" title="Projects"/);
});
