import assert from "node:assert/strict";
import { test } from "node:test";
import {
  repositoryDiscussionsPath,
  repositoryIssuePath,
  repositoryIssuesPath,
  repositoryLabelsPath,
  repositoryMilestonesPath,
  repositoryPath,
} from "../src/modules/repository/resource-navigation";

test("repository resource navigation builds canonical owner/name URLs", () => {
  assert.equal(repositoryPath("acme", "Operations"), "/acme/Operations");
  assert.equal(repositoryIssuesPath("acme", "Operations"), "/acme/Operations/issues");
  assert.equal(repositoryIssuePath("acme", "Operations", 12), "/acme/Operations/issues/12");
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
