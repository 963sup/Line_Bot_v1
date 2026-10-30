import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isStarListDiscovery,
  isTrendingRepository,
} from "@line_bot_v1/repository/contracts/parse-collection-response";

test("repository response validators accept current discovery contracts", () => {
  assert.equal(
    isTrendingRepository({
      id: "repository-1",
      ownerLogin: "acme",
      name: "operations",
      visibility: "public",
      permissions: ["read"],
      recentStarCount: 3,
      starCount: 8,
      starred: true,
    }),
    true,
  );
  assert.equal(
    isStarListDiscovery({
      id: "list-1",
      ownerLogin: "acme",
      name: "Operations",
      description: "Runbooks",
      visibleRepositoryCount: 1,
      updatedAt: 1,
      repositories: [{ id: "repository-1", ownerLogin: "acme", name: "operations" }],
    }),
    true,
  );
});

test("repository response validators reject unvalidated nested data", () => {
  assert.equal(
    isStarListDiscovery({
      id: "list-1",
      ownerLogin: "acme",
      name: "Operations",
      description: "Runbooks",
      visibleRepositoryCount: 1,
      updatedAt: 1,
      repositories: [{ id: "repository-1", ownerLogin: 42, name: "operations" }],
    }),
    false,
  );
});
