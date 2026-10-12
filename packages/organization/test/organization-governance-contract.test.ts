import assert from "node:assert/strict";
import test from "node:test";

import {
  parseOrganizationDetail,
  parseOrganizationList,
} from "../src/contracts/organization-governance.js";

const summary = {
  id: "organization-1",
  login: "acme",
  name: "Acme",
  status: "active",
  version: 1,
  actorMembershipStatus: "active",
  actorDirectMembershipVersion: 1,
  actorInvitationStatus: null,
  actorInvitationVersion: null,
  actorIsOwner: true,
  actorMemberRole: "ADMIN",
  actorCanCreateProjectV2: true,
};

test("organization output decoders validate list and nested detail fields", () => {
  assert.deepEqual(parseOrganizationList({ items: [summary], next: null }), {
    items: [summary],
    next: null,
  });

  const detail = {
    ...summary,
    memberCreationPolicy: {
      memberCanCreatePublicRepositories: true,
      memberCanCreatePrivateRepositories: true,
      memberCanCreateInternalRepositories: false,
      memberCanCreateProjectV2: true,
      memberCanCreateTeams: false,
    },
    members: [
      {
        userId: "user-1",
        status: "active",
        version: 1,
        sources: [{ kind: "direct", id: "user-1", version: 1 }],
        directMembershipVersion: 1,
        effectiveOwner: true,
        assignmentVersion: 1,
        memberRole: "ADMIN",
      },
    ],
    invitations: [],
  };

  assert.deepEqual(parseOrganizationDetail(detail), detail);
  assert.throws(() =>
    parseOrganizationDetail({
      ...detail,
      members: [{ ...detail.members[0], effectiveOwner: "yes" }],
    }),
  );
});
