import assert from "node:assert/strict";
import test from "node:test";
import { createTeamCollaboration } from "../src/application/collaboration.js";
import { parseTeamCommand } from "../src/application/commands/team-command.js";
import { TeamError } from "../src/domain/errors/team-error.js";
import { normalizeTeamSlug, teamSlugFromName } from "../src/domain/value-objects/team-slug.js";

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
      privacy: "SECRET",
      notificationSetting: "NOTIFICATIONS_DISABLED",
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
      privacy: "SECRET",
      notificationSetting: "NOTIFICATIONS_DISABLED",
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


test("Team hierarchy and settings commands preserve exact FPT values", () => {
  assert.deepEqual(
    parseTeamCommand({
      action: "parent-team",
      requestId: "33333333-3333-4333-8333-333333333333",
      organizationAccountId: "organization",
      teamId: "child",
      expectedVersion: 3,
      parentTeamId: "parent",
    }),
    {
      action: "parent-team",
      requestId: "33333333-3333-4333-8333-333333333333",
      organizationAccountId: "organization",
      teamId: "child",
      expectedVersion: 3,
      parentTeamId: "parent",
    },
  );
  assert.deepEqual(
    parseTeamCommand({
      action: "settings",
      requestId: "44444444-4444-4444-8444-444444444444",
      organizationAccountId: "organization",
      teamId: "team",
      expectedVersion: 4,
      privacy: "VISIBLE",
      notificationSetting: "NOTIFICATIONS_ENABLED",
    }),
    {
      action: "settings",
      requestId: "44444444-4444-4444-8444-444444444444",
      organizationAccountId: "organization",
      teamId: "team",
      expectedVersion: 4,
      privacy: "VISIBLE",
      notificationSetting: "NOTIFICATIONS_ENABLED",
    },
  );
  assert.throws(
    () =>
      parseTeamCommand({
        action: "parent-team",
        requestId: "55555555-5555-4555-8555-555555555555",
        organizationAccountId: "organization",
        teamId: "team",
        expectedVersion: 4,
        parentTeamId: "team",
      }),
    TeamError,
  );
});
