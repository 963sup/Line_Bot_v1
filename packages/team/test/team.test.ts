import assert from "node:assert/strict";
import test from "node:test";
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
