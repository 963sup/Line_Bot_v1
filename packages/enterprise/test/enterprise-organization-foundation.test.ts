import assert from "node:assert/strict";
import test from "node:test";
import {
  createOrganization,
  createOrganizationDirectMembership,
  createOrganizationInvitation,
  deactivateOrganization,
  OrganizationError,
  reactivateOrganization,
  removeOrganizationDirectMembership,
  resolveOrganizationInvitation,
} from "@line-work/organization/domain";
import { enterpriseGovernance } from "../src/application/enterprise-governance.js";
import type { EnterpriseGovernancePort } from "../src/application/ports/enterprise-governance.js";
import type { EnterpriseDetail } from "../src/contracts/enterprise-governance.js";
import {
  assignEnterpriseTeamToOrganization,
  createEnterprise,
  createEnterpriseTeam,
  createEnterpriseTeamMembership,
  deactivateEnterprise,
  detachEnterpriseTeamFromOrganization,
  EnterpriseError,
  enterpriseTeamSlugFromName,
  normalizeEnterpriseTeamSlug,
  reactivateEnterprise,
  removeEnterpriseTeamMembership,
  renameEnterpriseTeam,
} from "../src/domain.js";

test("enterprise lifecycle is reversible and versioned", () => {
  const active = createEnterprise("enterprise-1");
  assert.deepEqual(active, { id: "enterprise-1", status: "active", version: 1 });

  const inactive = deactivateEnterprise(active, 1);
  assert.deepEqual(inactive, { id: "enterprise-1", status: "inactive", version: 2 });

  const reactivated = reactivateEnterprise(inactive, 2);
  assert.deepEqual(reactivated, { id: "enterprise-1", status: "active", version: 3 });

  assert.throws(
    () => reactivateEnterprise(reactivated, 3),
    (error) => {
      assert.ok(error instanceof EnterpriseError);
      assert.equal(error.code, "invalid-transition");
      return true;
    },
  );
});

test("enterprise lifecycle rejects stale versions", () => {
  const enterprise = createEnterprise("enterprise-1");
  assert.throws(
    () => deactivateEnterprise(enterprise, 2),
    (error) => {
      assert.ok(error instanceof EnterpriseError);
      assert.equal(error.code, "conflict");
      return true;
    },
  );
});

test("enterprise team membership and organization assignment are independent versioned facts", () => {
  const team = createEnterpriseTeam("enterprise-1", "security", "Security");
  const membership = createEnterpriseTeamMembership(team, "user-1");
  const assignment = assignEnterpriseTeamToOrganization(team, "organization-1");

  assert.deepEqual(team, {
    id: "security",
    enterpriseAccountId: "enterprise-1",
    name: "Security",
    slug: "security",
    version: 1,
  });
  assert.equal(membership.status, "active");
  assert.equal(assignment.status, "active");
  assert.deepEqual(renameEnterpriseTeam(team, "Platform Security", 1), {
    ...team,
    name: "Platform Security",
    slug: "platform-security",
    version: 2,
  });
  assert.equal(removeEnterpriseTeamMembership(membership, 1).status, "removed");
  assert.equal(detachEnterpriseTeamFromOrganization(assignment, 1).status, "detached");

  assert.throws(
    () => removeEnterpriseTeamMembership(membership, 2),
    (error) => {
      assert.ok(error instanceof EnterpriseError);
      assert.equal(error.code, "conflict");
      return true;
    },
  );
});

test("organization lifecycle deactivates and reactivates without restoring other state", () => {
  const active = createOrganization("organization-1");
  const inactive = deactivateOrganization(active, 1);
  const reactivated = reactivateOrganization(inactive, 2);

  assert.deepEqual(inactive, { id: "organization-1", status: "inactive", version: 2 });
  assert.deepEqual(reactivated, { id: "organization-1", status: "active", version: 3 });
});

test("organization invitation and direct membership are separate facts", () => {
  const pending = createOrganizationInvitation("organization-1", "user-1");
  const accepted = resolveOrganizationInvitation(pending, "accepted", 1);
  const declined = resolveOrganizationInvitation(
    createOrganizationInvitation("organization-1", "user-2"),
    "declined",
    1,
  );
  const membership = createOrganizationDirectMembership("organization-1", "user-1");
  const removed = removeOrganizationDirectMembership(membership, 1);

  assert.deepEqual(pending, {
    organizationAccountId: "organization-1",
    userId: "user-1",
    status: "pending",
    version: 1,
  });
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.version, 2);
  assert.equal(declined.status, "declined");
  assert.equal(declined.version, 2);
  assert.equal(membership.status, "active");
  assert.equal(membership.version, 1);
  assert.equal(removed.status, "removed");
  assert.equal(removed.version, 2);

  assert.throws(
    () => resolveOrganizationInvitation(accepted, "cancelled", 2),
    (error) => {
      assert.ok(error instanceof OrganizationError);
      assert.equal(error.code, "invalid-transition");
      return true;
    },
  );
});

test("organization foundation rejects invalid identity and stale versions", () => {
  assert.throws(() => createOrganization(""), OrganizationError);
  assert.throws(() => createOrganizationDirectMembership("organization-1", ""), OrganizationError);
  assert.throws(() => createOrganizationInvitation("organization-1", ""), OrganizationError);

  const organization = createOrganization("organization-1");
  assert.throws(
    () => deactivateOrganization(organization, 2),
    (error) => {
      assert.ok(error instanceof OrganizationError);
      assert.equal(error.code, "conflict");
      return true;
    },
  );
});

test("enterprise slug is normalized independently from RepositoryOwner login", async () => {
  const { normalizeEnterpriseSlug } = await import("../src/domain.js");
  assert.equal(normalizeEnterpriseSlug(" ACME-Global "), "acme-global");
  assert.throws(() => normalizeEnterpriseSlug("bad slug"), EnterpriseError);
});

test("enterprise canonical slug lookup normalizes locator before governance lookup", async () => {
  const expected: EnterpriseDetail = {
    id: "enterprise-1",
    name: "Acme Enterprise",
    slug: "acme-enterprise",
    status: "active",
    version: 1,
    actorAffiliations: [],
    actorInvitationStatus: null,
    actorInvitationVersion: null,
    actorIsOwner: true,
    users: [],
    directAffiliations: [],
    invitations: [],
    organizations: [],
    teams: [],
  };
  let observedSlug = "";
  const port: EnterpriseGovernancePort = {
    async list() {
      throw new Error("not used");
    },
    async detail() {
      throw new Error("not used");
    },
    async detailBySlug(_actor, slug) {
      observedSlug = slug;
      return expected;
    },
    async execute() {
      throw new Error("not used");
    },
  };
  const service = enterpriseGovernance(port);
  const actor = { provider: "line:test", subject: `U${"1".repeat(32)}` };

  assert.equal(await service.detailBySlug(actor, " ACME-Enterprise "), expected);
  assert.equal(observedSlug, "acme-enterprise");
  assert.throws(() => service.detailBySlug(actor, "bad slug"), EnterpriseError);
});

test("enterprise team slug is derived from mutable name and stable id stays separate", () => {
  assert.equal(enterpriseTeamSlugFromName(" Platform SRE "), "platform-sre");
  assert.equal(enterpriseTeamSlugFromName("財務 團隊"), "財務-團隊");
  assert.equal(normalizeEnterpriseTeamSlug("PLATFORM-SRE"), "platform-sre");
  assert.throws(() => normalizeEnterpriseTeamSlug("bad/slug"), EnterpriseError);
});
