import assert from "node:assert/strict";
import test from "node:test";
import { createTeamCollaboration } from "../src/application/collaboration.js";
import { buildTeamCommand, parseTeamCommand } from "../src/application/commands/team-command.js";
import { normalizeTeamSlug, teamSlugFromName } from "../src/application/commands/team-slug.js";
import { TeamCommandUseCase } from "../src/application/use-cases/team-command.js";
import { TeamError } from "../src/contracts/errors/team-error.js";
import type { TeamMutationTransaction } from "../src/contracts/output/team-mutation.js";
import type { TeamCommandReceipt, TeamView } from "../src/contracts.js";
import {
  type DirectTeamMembership,
  grantMaintainerAssignment,
  revokeMaintainerAssignment,
  TeamDomainError,
} from "../src/domain/team.js";

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

test("team command builder keeps scope and accepts request identity from the delivery adapter", () => {
  const data: TeamView = {
    userId: "user-1",
    organizations: [],
    organizationAccountId: "org-1",
    organizationLogin: "org",
    viewerCanCreateTeams: true,
    teams: [],
    team: {
      id: "team-1",
      organizationAccountId: "org-1",
      name: "Core",
      slug: "core",
      parentTeamId: null,
      privacy: "SECRET",
      notificationSetting: "NOTIFICATIONS_DISABLED",
      version: 7,
      membershipStatus: "active",
      membershipType: null,
      isMaintainer: true,
      canManage: true,
    },
    childTeams: [],
    members: [],
  };
  assert.deepEqual(
    buildTeamCommand(data, { action: "rename-team", name: "Platform" }, "request-1"),
    {
      action: "rename-team",
      requestId: "request-1",
      organizationAccountId: "org-1",
      teamId: "team-1",
      expectedVersion: 7,
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

test("typed Team command execution snapshots caller-owned input before transaction work", async () => {
  const command = {
    action: "create-team" as const,
    requestId: "66666666-6666-4666-8666-666666666666",
    organizationAccountId: "organization",
    name: "Before",
    privacy: "SECRET" as const,
    notificationSetting: "NOTIFICATIONS_DISABLED" as const,
  };
  let createdName = "";
  let membership: DirectTeamMembership | null = null;
  let recorded: TeamCommandReceipt | null = null;
  const transaction: TeamMutationTransaction = {
    actor: {
      userId: "user",
      userStatusVersion: 1,
      isOrganizationOwner: true,
      canCreateTeams: true,
    },
    replay: null,
    newTeamId: () => "team",
    lockTeam: async () => {
      throw new Error("unexpected lockTeam");
    },
    lockParent: async () => {
      throw new Error("unexpected lockParent");
    },
    directMemberships: async () => (membership ? [membership] : []),
    memberFacts: async () => [],
    isMaintainer: async () => false,
    activeOrganizationParticipants: async () => new Set(["user"]),
    activeUserStatusVersion: async () => 1,
    createTeam: async (team) => {
      createdName = team.name;
    },
    saveTeamName: async () => {
      throw new Error("unexpected saveTeamName");
    },
    saveTeamSettings: async () => {
      throw new Error("unexpected saveTeamSettings");
    },
    saveTeamParent: async () => {
      throw new Error("unexpected saveTeamParent");
    },
    saveMembership: async (_teamId, next) => {
      membership = next;
    },
    maintainerAssignment: async () => null,
    saveMaintainerAssignment: async () => undefined,
    incrementTeamVersion: async () => 1,
    record: async (_teamId, receipt) => {
      recorded = receipt;
    },
  };
  const useCase = new TeamCommandUseCase({
    async transact(_actor, _scope, evidence, operation) {
      command.name = "After";
      assert.equal(JSON.parse(evidence.payload).name, "Before");
      return operation(transaction);
    },
  });
  const result = await useCase.execute({ provider: "line:test", subject: "subject" }, command, 1);
  assert.equal(createdName, "Before");
  assert.deepEqual(result, {
    organizationAccountId: "organization",
    teamId: "team",
    userId: "user",
  });
  assert.deepEqual(recorded, result);
});

test("Domain owns TeamMaintainer epoch binding and assignment transitions", () => {
  const current = {
    status: "revoked" as const,
    version: 2,
    userStatusVersion: 1,
    membershipVersion: 1,
  };
  const granted = grantMaintainerAssignment(current, {
    expectedUserStatusVersion: 3,
    activeUserStatusVersion: 3,
    organizationParticipant: true,
    membership: { userId: "member", name: "Member", status: "active", version: 4 },
  });
  assert.deepEqual(granted, {
    status: "active",
    version: 3,
    userStatusVersion: 3,
    membershipVersion: 4,
  });
  assert.deepEqual(revokeMaintainerAssignment(granted), {
    ...granted,
    status: "revoked",
    version: 4,
  });
  assert.throws(
    () =>
      grantMaintainerAssignment(null, {
        expectedUserStatusVersion: 3,
        activeUserStatusVersion: 3,
        organizationParticipant: false,
        membership: { userId: "member", name: "Member", status: "active", version: 4 },
      }),
    (error: unknown) =>
      error instanceof TeamDomainError && error.code === "maintainer-organization-ineligible",
  );
});
