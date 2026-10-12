import assert from "node:assert/strict";
import test from "node:test";

import {
  parseEnterpriseDetail,
  parseEnterpriseList,
} from "../src/contracts/enterprise-governance.js";

const summary = {
  id: "enterprise-1",
  name: "Acme",
  slug: "acme",
  status: "active",
  version: 1,
  actorAffiliations: [{ kind: "direct", id: "user-1", version: 1 }],
  actorInvitationStatus: null,
  actorInvitationVersion: null,
  actorIsOwner: true,
};

test("enterprise output decoders validate list and nested detail fields", () => {
  assert.deepEqual(parseEnterpriseList({ items: [summary], next: null }), {
    items: [summary],
    next: null,
  });

  const detail = {
    ...summary,
    users: [
      {
        userId: "user-1",
        sources: summary.actorAffiliations,
        effectiveOwner: true,
        assignmentVersion: 1,
      },
    ],
    directAffiliations: [{ userId: "user-1", status: "active", version: 1 }],
    invitations: [],
    organizations: [{ organizationAccountId: "organization-1", status: "active", version: 1 }],
    outsideRepositoryCollaborators: [
      {
        organizationAccountId: "organization-1",
        repositoryId: "repository-1",
        userId: "user-2",
        capability: "triage",
        grantVersion: 1,
      },
    ],
    teams: [],
  };

  assert.deepEqual(parseEnterpriseDetail(detail), detail);
  assert.throws(() =>
    parseEnterpriseDetail({
      ...detail,
      outsideRepositoryCollaborators: [
        { ...detail.outsideRepositoryCollaborators[0], capability: "SUPER_ADMIN" },
      ],
    }),
  );
});
