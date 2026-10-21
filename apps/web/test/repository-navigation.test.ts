import assert from "node:assert/strict";
import { test } from "node:test";
import {
  repositoryAccessPath,
  repositoryDiscussionsPath,
  repositoryIssueCreatePath,
  repositoryIssuePath,
  repositoryIssuesPath,
  repositoryLabelsPath,
  repositoryMilestonesPath,
  repositoryObjectPath,
  repositoryObjectsPath,
  repositoryPath,
  repositoryResourceNavigationItems,
  repositorySettingsPath,
  repositoryStarListCreatePath,
  repositoryStarListDiscoverPath,
  repositoryStarListPath,
  repositoryStarListsPath,
} from "../src/modules/repository/resource-navigation";

test("repository resource navigation builds canonical owner/name URLs", () => {
  assert.equal(repositoryPath("acme", "Operations"), "/acme/Operations");
  assert.equal(repositoryAccessPath("acme", "Operations"), "/acme/Operations/access");
  assert.equal(repositorySettingsPath("acme", "Operations"), "/acme/Operations/settings");
  assert.equal(repositoryIssuesPath("acme", "Operations"), "/acme/Operations/issues");
  assert.equal(repositoryObjectsPath("acme", "Operations"), "/acme/Operations/objects");
  assert.equal(
    repositoryObjectPath("acme", "Operations", "object / 1"),
    "/acme/Operations/objects/object%20%2F%201",
  );
  assert.equal(repositoryIssuePath("acme", "Operations", 12), "/acme/Operations/issues/12");
  assert.equal(repositoryIssueCreatePath("acme", "Operations"), "/acme/Operations/issues?create=1");
  assert.equal(repositoryDiscussionsPath("acme", "Operations"), "/acme/Operations/discussions");
  assert.equal(repositoryLabelsPath("acme", "Operations"), "/acme/Operations/labels");
  assert.equal(repositoryMilestonesPath("acme", "Operations"), "/acme/Operations/milestones");
});

test("repository resource navigation encodes path segments independently", () => {
  assert.equal(
    repositoryIssuesPath("Acme Team", "Line/Bot v1"),
    "/Acme%20Team/Line%2FBot%20v1/issues",
  );
});

test("Repository Star List navigation stays under the existing repositories root", () => {
  assert.equal(repositoryStarListsPath(), "/repositories/lists");
  assert.equal(repositoryStarListCreatePath(), "/repositories/lists/new");
  assert.equal(repositoryStarListDiscoverPath(), "/repositories/lists/discover");
  assert.equal(repositoryStarListPath("list / 1"), "/repositories/lists/list%20%2F%201");
});

test("repository resource navigation exposes one ordered map and gates management links", () => {
  assert.deepEqual(
    repositoryResourceNavigationItems("acme", "Operations", false).map((item) => item.section),
    [
      "overview",
      "content",
      "resources",
      "contracts",
      "executions",
      "objects",
      "issues",
      "discussions",
      "wiki",
      "insights",
      "labels",
      "milestones",
    ],
  );
  assert.deepEqual(
    repositoryResourceNavigationItems("acme", "Operations", true).map((item) => item.section),
    [
      "overview",
      "content",
      "resources",
      "contracts",
      "executions",
      "objects",
      "issues",
      "discussions",
      "wiki",
      "insights",
      "labels",
      "milestones",
      "settings",
      "access",
    ],
  );
  const items = repositoryResourceNavigationItems("acme", "Operations", true);
  assert.deepEqual(
    items.filter((item) => item.group === "primary").map((item) => item.section),
    [
      "overview",
      "content",
      "resources",
      "contracts",
      "executions",
      "issues",
      "discussions",
      "wiki",
      "insights",
    ],
  );
  assert.deepEqual(
    items.filter((item) => item.group === "more").map((item) => item.section),
    ["objects", "labels", "milestones", "settings", "access"],
  );
});
