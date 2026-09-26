import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

type Locator = Readonly<{
  id: string;
  fields: string[];
  scope: string;
  scopeAuthority: string;
  status: string;
}>;

type SemanticModel = Readonly<{
  locators: Locator[];
}>;

type ImplementationTopology = Readonly<{
  modules: Record<string, { allowedWorkspaceDependencies?: string[] }>;
}>;

function readRepoFile(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

function readRepoJson<T>(path: string): T {
  return JSON.parse(readRepoFile(path)) as T;
}

const semantic = readRepoJson<SemanticModel>("architecture/semantic-model.json");
const topology = readRepoJson<ImplementationTopology>("architecture/implementation-topology.json");

function locator(id: string): Locator {
  const value = semantic.locators.find((item) => item.id === id);
  assert.ok(value, `semantic locator ${id} must exist`);
  assert.equal(value.status, "active");
  return value;
}

function workspaceDependencies(moduleName: string): string[] {
  const module = topology.modules[moduleName];
  assert.ok(module, `implementation module ${moduleName} must exist`);
  return module.allowedWorkspaceDependencies ?? [];
}

test("User and Organization share Account login namespace through the sole direct consumer", () => {
  const user = locator("user-login");
  const organization = locator("organization-login");

  assert.equal(user.scope, "shared-account-login-namespace");
  assert.equal(organization.scope, user.scope);
  assert.equal(user.scopeAuthority, "account");
  assert.equal(organization.scopeAuthority, "account");
  assert.deepEqual(user.fields, ["login"]);
  assert.deepEqual(organization.fields, ["login"]);

  assert.equal(workspaceDependencies("@line-work/account").includes("@line-work/namespace"), true);
  for (const moduleName of [
    "@line-work/enterprise",
    "@line-work/organization",
    "@line-work/repository",
    "@line-work/team",
  ]) {
    assert.equal(
      workspaceDependencies(moduleName).includes("@line-work/namespace"),
      false,
      `${moduleName} owns a scoped locator and must not depend on Namespace without shared policy`,
    );
  }
});

test("Enterprise, Team, and Repository locators preserve their owner-local uniqueness scopes", () => {
  const enterprise = locator("enterprise-slug");
  const organizationTeam = locator("organization-team-slug");
  const enterpriseTeam = locator("enterprise-team-slug");
  const repository = locator("repository-owner-name");

  assert.deepEqual(
    {
      fields: enterprise.fields,
      scope: enterprise.scope,
      scopeAuthority: enterprise.scopeAuthority,
    },
    {
      fields: ["slug"],
      scope: "enterprise-slug-namespace",
      scopeAuthority: "enterprise",
    },
  );
  assert.deepEqual(
    {
      fields: organizationTeam.fields,
      scope: organizationTeam.scope,
      scopeAuthority: organizationTeam.scopeAuthority,
    },
    {
      fields: ["organizationLogin", "teamSlug"],
      scope: "organization-scoped-team-slug",
      scopeAuthority: "team",
    },
  );
  assert.deepEqual(
    {
      fields: enterpriseTeam.fields,
      scope: enterpriseTeam.scope,
      scopeAuthority: enterpriseTeam.scopeAuthority,
    },
    {
      fields: ["enterpriseSlug", "teamSlug"],
      scope: "enterprise-scoped-team-slug",
      scopeAuthority: "enterprise",
    },
  );
  assert.deepEqual(
    {
      fields: repository.fields,
      scope: repository.scope,
      scopeAuthority: repository.scopeAuthority,
    },
    {
      fields: ["ownerLogin", "name"],
      scope: "repository-owner-login-and-name",
      scopeAuthority: "repository",
    },
  );

  assert.match(readRepoFile("supabase/schemas/200_enterprises.sql"), /slug text not null unique/);
  assert.match(
    readRepoFile("supabase/schemas/400_teams.sql"),
    /create unique index teams_organization_slug\s+on app_private\.teams\(organization_account_id, slug\);/,
  );
  assert.match(
    readRepoFile("supabase/schemas/210_enterprise_teams.sql"),
    /create unique index enterprise_teams_enterprise_slug\s+on app_private\.enterprise_teams\(enterprise_account_id, slug\);/,
  );
  assert.match(
    readRepoFile("supabase/schemas/600_repositories.sql"),
    /create unique index repositories_owner_name on app_private\.repositories \(owner_account_id, lower\(name\)\);/,
  );
});

test("Repository child locators remain Repository-scoped instead of becoming global namespaces", () => {
  for (const id of ["issue-number", "repository-milestone-number", "discussion-opaque-id"]) {
    assert.equal(locator(id).scopeAuthority, "repository");
  }
  assert.equal(locator("issue-number").scope, "repository-scoped-issue-number");
  assert.equal(locator("repository-milestone-number").scope, "repository-scoped-milestone-number");
  assert.equal(locator("discussion-opaque-id").scope, "repository-scoped-local-discussion-id");

  assert.match(
    readRepoFile("supabase/schemas/620_issues.sql"),
    /constraint "issues_repository_id_number_unique" unique \(repository_id, number\)/,
  );
  assert.match(
    readRepoFile("supabase/schemas/611_repository_milestones.sql"),
    /constraint repository_milestones_repository_number_unique unique \(repository_id, number\)/,
  );
});

test("Repository Label name remains a Repository-local namespace key", () => {
  assert.equal(
    workspaceDependencies("@line-work/repository").includes("@line-work/namespace"),
    false,
  );
  assert.match(
    readRepoFile("supabase/schemas/610_repository_labels.sql"),
    /constraint repository_labels_repository_name_unique unique \(repository_id, name\)/,
  );
});
