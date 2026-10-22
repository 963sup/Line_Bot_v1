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

test("repository navigation exposes only current delivery owners", () => {
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
  assert.ok(items.every((item) => !item.href.endsWith("/objects")));
});

test("Repository Overview presents current delivery owners without a legacy Object entry", () => {
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
  assert.doesNotMatch(source, /repository-legacy-heading|repositoryObjectsPath|Objects \(Legacy\)/);
  assert.match(source, /<ActionRow href="\/projects" title="Projects"/);
});
