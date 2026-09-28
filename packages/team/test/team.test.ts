import assert from "node:assert/strict";
import test from "node:test";
import { buildTeamCommand } from "../src/application/build-command.js";
import { createTeamCollaboration } from "../src/application/collaboration.js";
import { normalizeTeamSlug, parseTeamCommand, TeamError, teamSlugFromName } from "../src/domain.js";

test("invalid and retired Team operations fail before constructing the repository", () => {
  const service = createTeamCollaboration(
    () => {
      throw Error("unexpected repository access");
    },
    () => 1,
  );
  const actor = { provider: "line:test", subject: "test" };
  for (const input of [
    null,
    [],
    {},
    { action: "join", requestId: "bad" },
    {
      action: "join",
      requestId: "11111111-1111-4111-8111-111111111111",
      organizationAccountId: "organization",
      teamId: "team",
      name: "名稱",
      groupId: "retired",
    },
  ]) {
    assert.throws(() => service.execute(actor, input), TeamError, JSON.stringify(input));
  }
  assert.throws(() => service.view(actor, "organization", "x".repeat(129)), TeamError);
  assert.throws(() => service.view(actor, "", "team"), TeamError);
});

test("rename-team is an explicit versioned command", () => {
  assert.deepEqual(
    parseTeamCommand({
      action: "rename-team",
      requestId: "11111111-1111-4111-8111-111111111111",
      organizationAccountId: "organization",
      teamId: "team",
      expectedVersion: 2,
      name: "Platform",
    }),
    {
      action: "rename-team",
      requestId: "11111111-1111-4111-8111-111111111111",
      organizationAccountId: "organization",
      teamId: "team",
      expectedVersion: 2,
      name: "Platform",
    },
  );
});

test("team slug is derived from mutable team name while TeamId stays separate", () => {
  assert.equal(teamSlugFromName(" Platform SRE "), "platform-sre");
  assert.equal(teamSlugFromName("財務 團隊"), "財務-團隊");
  assert.equal(normalizeTeamSlug("PLATFORM-SRE"), "platform-sre");
  assert.throws(() => normalizeTeamSlug("bad/slug"), TeamError);
  assert.throws(() => teamSlugFromName("---"), TeamError);
});

test("create-team command does not expose server-generated TeamId", () => {
  assert.deepEqual(
    parseTeamCommand({
      action: "create-team",
      requestId: "22222222-2222-4222-8222-222222222222",
      organizationAccountId: "organization",
      name: "Platform",
    }),
    {
      action: "create-team",
      requestId: "22222222-2222-4222-8222-222222222222",
      organizationAccountId: "organization",
      name: "Platform",
    },
  );
  assert.throws(
    () =>
      parseTeamCommand({
        action: "create-team",
        requestId: "22222222-2222-4222-8222-222222222222",
        organizationAccountId: "organization",
        teamId: "caller-owned",
        name: "Platform",
      }),
    TeamError,
  );
});

test("buildTeamCommand keeps Team command context and version semantics", () => {
  const requestId = "11111111-1111-4111-8111-111111111111";
  const view = {
    userId: "user",
    organizations: [],
    organizationAccountId: "organization",
    organizationLogin: "org",
    teams: [],
    team: {
      id: "team",
      organizationAccountId: "organization",
      name: "Platform",
      slug: "platform",
      version: 7,
      membershipStatus: "active" as const,
      isMaintainer: true,
    },
    members: [],
  };

  assert.deepEqual(buildTeamCommand(view, { action: "create-team", name: "SRE" }, requestId), {
    action: "create-team",
    requestId,
    organizationAccountId: "organization",
    name: "SRE",
  });
  assert.deepEqual(buildTeamCommand(view, { action: "rename-team", name: "SRE" }, requestId), {
    action: "rename-team",
    requestId,
    organizationAccountId: "organization",
    teamId: "team",
    expectedVersion: 7,
    name: "SRE",
  });
  assert.deepEqual(
    buildTeamCommand(view, { action: "join", name: "Platform", teamId: "other-team" }, requestId),
    {
      action: "join",
      requestId,
      organizationAccountId: "organization",
      teamId: "other-team",
      expectedVersion: 0,
      name: "Platform",
    },
  );
  assert.deepEqual(
    buildTeamCommand(
      view,
      { action: "membership", targetUserId: "member", status: "removed" },
      requestId,
    ),
    {
      action: "membership",
      requestId,
      organizationAccountId: "organization",
      teamId: "team",
      expectedVersion: 7,
      targetUserId: "member",
      status: "removed",
    },
  );
  assert.deepEqual(
    buildTeamCommand(
      view,
      { action: "maintainer", targetUserId: "member", enabled: true },
      requestId,
    ),
    {
      action: "maintainer",
      requestId,
      organizationAccountId: "organization",
      teamId: "team",
      expectedVersion: 7,
      targetUserId: "member",
      enabled: true,
    },
  );
});
