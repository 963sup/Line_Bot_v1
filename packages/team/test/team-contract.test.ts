import assert from "node:assert/strict";
import test from "node:test";

import { parseTeamView } from "../src/contracts.js";

test("team output decoder validates every nested view", () => {
  const team = {
    id: "team-1",
    organizationAccountId: "organization-1",
    name: "Platform",
    slug: "platform",
    parentTeamId: null,
    privacy: "VISIBLE",
    notificationSetting: "NOTIFICATIONS_ENABLED",
    version: 1,
    membershipStatus: "active",
    membershipType: "IMMEDIATE",
    isMaintainer: true,
    canManage: true,
  };
  const view = {
    userId: "user-1",
    organizations: [{ organizationAccountId: "organization-1", login: "acme" }],
    organizationAccountId: "organization-1",
    organizationLogin: "acme",
    viewerCanCreateTeams: true,
    teams: [team],
    team,
    childTeams: [],
    members: [
      {
        userId: "user-1",
        name: "Ada",
        status: "active",
        userStatus: "active",
        isMaintainer: true,
        membershipType: "IMMEDIATE",
        sourceTeamId: null,
      },
    ],
  };

  assert.deepEqual(parseTeamView(view), view);
  assert.throws(() => parseTeamView({ ...view, teams: [{ ...team, privacy: "PUBLIC" }] }));
});
