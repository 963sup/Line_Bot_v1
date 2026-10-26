import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { record, stringArray, stringValue } from "@line_bot_v1/platform/validation";

type Locator = Readonly<{
  id: string;
  fields: string[];
  scope: string;
  scopeAuthority: string;
  status: string;
}>;

function readRepoFile(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

function readRepoJson(path: string): Record<string, unknown> {
  return record(JSON.parse(readRepoFile(path)));
}

const semantic = readRepoJson("architecture/semantic-model.json");
const rawLocators = semantic.locators;
assert.ok(Array.isArray(rawLocators));
const locators: Locator[] = rawLocators.map((value) => {
  const item = record(value);
  return {
    id: stringValue(item.id),
    fields: stringArray(item.fields),
    scope: stringValue(item.scope),
    scopeAuthority: stringValue(item.scopeAuthority),
    status: stringValue(item.status),
  };
});
const topology = readRepoJson("architecture/implementation-topology.json");
const modules = record(topology.modules);

function locator(id: string): Locator {
  const value = locators.find((item) => item.id === id);
  assert.ok(value, `semantic locator ${id} must exist`);
  assert.equal(value.status, "active");
  return value;
}

function workspaceDependencies(moduleName: string): string[] {
  const module = record(modules[moduleName]);
  assert.ok(module, `implementation module ${moduleName} must exist`);
  return module.allowedWorkspaceDependencies === undefined
    ? []
    : stringArray(module.allowedWorkspaceDependencies);
}

test("User and Organization share the global Account Namespace authority", () => {
  const user = locator("user-login");
  const organization = locator("organization-login");

  assert.equal(user.scope, "shared-account-login-namespace");
  assert.equal(organization.scope, user.scope);
  assert.equal(user.scopeAuthority, "namespace");
  assert.equal(organization.scopeAuthority, "namespace");
  assert.deepEqual(user.fields, ["login"]);
  assert.deepEqual(organization.fields, ["login"]);

  assert.equal(
    workspaceDependencies("@line_bot_v1/account").includes("@line_bot_v1/namespace"),
    true,
  );
});

test("Enterprise, Team, and Repository locators use Namespace with their original scopes", () => {
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
      scopeAuthority: "namespace",
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
      scopeAuthority: "namespace",
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
      scopeAuthority: "namespace",
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
      scopeAuthority: "namespace",
    },
  );

  const enterpriseSchema = readRepoFile(
    "packages/integration-supabase/src/schemas/200_enterprises.sql",
  );
  assert.match(enterpriseSchema, /slug text unique/);
  assert.match(enterpriseSchema, /enterprises_identity_completeness_check/);
  assert.match(
    readRepoFile("packages/integration-supabase/src/schemas/400_teams.sql"),
    /create unique index teams_organization_slug\s+on app_private\.teams\(organization_account_id, slug\);/,
  );
  assert.match(
    readRepoFile("packages/integration-supabase/src/schemas/210_enterprise_teams.sql"),
    /create unique index enterprise_teams_enterprise_slug\s+on app_private\.enterprise_teams\(enterprise_account_id, slug\);/,
  );
  assert.match(
    readRepoFile("packages/integration-supabase/src/schemas/600_repositories.sql"),
    /create unique index repositories_owner_name on app_private\.repositories \(owner_account_id, lower\(name\)\);/,
  );
});

test("Repository child locators remain scoped while Numbering owns sequential locators", () => {
  for (const id of ["issue-number", "repository-milestone-number", "discussion-number"])
    assert.equal(locator(id).scopeAuthority, "numbering");
  assert.equal(locator("discussion-opaque-id").scopeAuthority, "repository");
  assert.equal(locator("issue-number").scope, "repository-scoped-issue-number");
  assert.equal(locator("repository-milestone-number").scope, "repository-scoped-milestone-number");
  assert.equal(locator("discussion-opaque-id").scope, "repository-scoped-local-discussion-id");

  assert.match(
    readRepoFile("packages/integration-supabase/src/schemas/620_issues.sql"),
    /constraint "issues_repository_id_number_unique" unique \(repository_id, number\)/,
  );
  assert.match(
    readRepoFile("packages/integration-supabase/src/schemas/611_repository_milestones.sql"),
    /constraint repository_milestones_repository_number_unique unique \(repository_id, number\)/,
  );
});

test("Repository Label name remains a Repository-local namespace key", () => {
  assert.match(
    readRepoFile("packages/integration-supabase/src/schemas/610_repository_labels.sql"),
    /constraint repository_labels_repository_name_unique unique \(repository_id, name\)/,
  );
});
