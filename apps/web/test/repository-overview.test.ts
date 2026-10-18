import assert from "node:assert/strict";
import { test } from "node:test";
import { RepositoryError } from "@line_bot_v1/repository/domain";
import { createRepositoryOverviewReader } from "../src/app/api/_composition/repository-overview.server";
import { repositoryOverviewRequest } from "../src/modules/repository/overview-http.server";
import { parseRepositoryOverview } from "../src/modules/repository/repository-overview";
import { RequestIdentityError } from "../src/shared/server/request-identity-error";

const repository = {
  id: "repo-1",
  ownerLogin: "octo",
  name: "Shared",
  visibility: "private" as const,
  archived: true,
  permissions: ["admin" as const],
};

test("Repository Overview HTTP binds verified identity to the canonical selector", async () => {
  const calls: unknown[][] = [];
  const response = await repositoryOverviewRequest(
    new Request("https://example.com/api/repository-overview?owner=octo&name=Shared"),
    async (subject, selector) => {
      calls.push([subject, selector]);
      return { repository, legacyWbs: { status: "available" } };
    },
    async () => "verified-subject",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [["verified-subject", { ownerLogin: "octo", repositoryName: "Shared" }]]);
  assert.deepEqual(await response.json(), {
    repository,
    legacyWbs: { status: "available" },
  });
});

test("Repository Overview HTTP rejects malformed queries and unverified actors", async () => {
  const read = async () => ({ repository, legacyWbs: { status: "none" as const } });
  const identity = async () => "verified-subject";
  const malformed = await repositoryOverviewRequest(
    new Request("https://example.com/api/repository-overview?owner=octo&name=Shared&extra=1"),
    read,
    identity,
  );
  assert.equal(malformed.status, 400);

  const unauthorized = await repositoryOverviewRequest(
    new Request("https://example.com/api/repository-overview?owner=octo&name=Shared"),
    read,
    async () => {
      throw new RequestIdentityError(401, "session expired");
    },
  );
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await unauthorized.json(), { error: "session expired" });
});

test("Repository Overview retains metadata when only the legacy source is unavailable", async () => {
  const calls: unknown[][] = [];
  const read = createRepositoryOverviewReader({
    activeUser: async (subject) => {
      calls.push(["actor", subject]);
      return { id: "user-1" };
    },
    scope: async (userId, selector) => {
      calls.push(["scope", userId, selector]);
      return { repository, visibility: repository.visibility, archived: repository.archived };
    },
    legacy: async (subject, repositoryId) => {
      calls.push(["legacy", subject, repositoryId]);
      throw new RepositoryError(503, "legacy source unavailable");
    },
  });

  const result = await read("verified-subject", {
    ownerLogin: "octo",
    repositoryName: "Shared",
  });
  assert.deepEqual(result, {
    repository,
    legacyWbs: { status: "unavailable" },
  });
  assert.deepEqual(calls, [
    ["actor", "verified-subject"],
    ["scope", "user-1", { ownerLogin: "octo", repositoryName: "Shared" }],
    ["legacy", "verified-subject", "repo-1"],
  ]);
});

test("Repository Overview exposes only durable legacy presence and propagates authorization denial", async () => {
  const base = {
    activeUser: async () => ({ id: "user-1" }),
    scope: async () => ({
      repository,
      visibility: repository.visibility,
      archived: repository.archived,
    }),
  };
  const available = createRepositoryOverviewReader({
    ...base,
    legacy: async () => ({ entryRequired: true }),
  });
  assert.deepEqual(await available("subject", { ownerLogin: "octo", repositoryName: "Shared" }), {
    repository,
    legacyWbs: { status: "available" },
  });

  const none = createRepositoryOverviewReader({
    ...base,
    legacy: async () => ({ entryRequired: false }),
  });
  assert.deepEqual(await none("subject", { ownerLogin: "octo", repositoryName: "Shared" }), {
    repository,
    legacyWbs: { status: "none" },
  });

  const forbidden = createRepositoryOverviewReader({
    ...base,
    legacy: async () => {
      throw new RepositoryError(403, "forbidden");
    },
  });
  await assert.rejects(
    forbidden("subject", { ownerLogin: "octo", repositoryName: "Shared" }),
    (error: unknown) => error instanceof RepositoryError && error.status === 403,
  );
});

test("Repository Overview response parser rejects incomplete permission and legacy state", () => {
  assert.deepEqual(parseRepositoryOverview({ repository, legacyWbs: { status: "none" } }), {
    repository,
    legacyWbs: { status: "none" },
  });
  assert.throws(() =>
    parseRepositoryOverview({
      repository: { ...repository, permissions: ["owner"] },
      legacyWbs: { status: "none" },
    }),
  );
  assert.throws(() => parseRepositoryOverview({ repository, legacyWbs: { status: "unknown" } }));
});
