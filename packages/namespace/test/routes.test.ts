import assert from "node:assert/strict";
import { accessSync } from "node:fs";
import { test } from "node:test";
import { buildNamespacePath, NAMESPACE_ROUTES } from "../src/domain/routes.js";

const activeDeliveryRoutes = {
  account: { file: "(public)/[login]/page.tsx" },
  repository: { file: "(resource)/[login]/[repository]/page.tsx" },
  "repository-issues": { file: "(resource)/[login]/[repository]/issues/page.tsx" },
  "repository-issue": {
    file: "(resource)/[login]/[repository]/issues/[issueNumber]/page.tsx",
  },
  "repository-discussions": {
    file: "(resource)/[login]/[repository]/discussions/page.tsx",
  },
  "repository-discussion-id": {
    file: "(resource)/[login]/[repository]/discussions/[discussionId]/page.tsx",
  },
  "organization-team": {
    file: "(mobile)/orgs/[login]/teams/[teamSlug]/page.tsx",
    aliases: { login: "organization" },
  },
  enterprise: {
    file: "(mobile)/enterprises/[slug]/page.tsx",
    aliases: { slug: "enterpriseSlug" },
  },
  settings: { file: "(mobile)/settings/page.tsx" },
  "settings-account": { file: "(mobile)/settings/account/page.tsx" },
  "settings-profile": { file: "(mobile)/settings/profile/page.tsx" },
  "settings-network": { file: "(mobile)/settings/network/page.tsx" },
  "settings-permissions": { file: "(mobile)/settings/permissions/page.tsx" },
  notifications: { file: "(mobile)/notifications/page.tsx" },
  stars: { file: "(mobile)/stars/page.tsx" },
  issues: { file: "(mobile)/issues/page.tsx" },
} as const;

function routeTemplateFromAppFile(
  file: string,
  aliases: Readonly<Record<string, string>> = {},
): string {
  const segments = file
    .replace(/\/page\.tsx$/, "")
    .split("/")
    .filter((segment) => !/^\(.+\)$/.test(segment))
    .map((segment) => {
      const parameter = /^\[([^\]]+)\]$/.exec(segment)?.[1];
      return parameter ? `{${aliases[parameter] ?? parameter}}` : segment;
    });
  return `/${segments.join("/")}`;
}

test("active descriptors match the current Web delivery route contract", () => {
  const descriptors = new Map(
    NAMESPACE_ROUTES.filter((route) => route.state === "active").map((route) => [route.id, route]),
  );
  assert.deepEqual([...descriptors.keys()], Object.keys(activeDeliveryRoutes));

  for (const id of Object.keys(activeDeliveryRoutes) as (keyof typeof activeDeliveryRoutes)[]) {
    const delivery = activeDeliveryRoutes[id];
    accessSync(new URL(`../../../apps/web/src/app/${delivery.file}`, import.meta.url));
    assert.equal(
      descriptors.get(id)?.pathTemplate,
      routeTemplateFromAppFile(delivery.file, "aliases" in delivery ? delivery.aliases : {}),
      id,
    );
  }

  assert.deepEqual(NAMESPACE_ROUTES.find((route) => route.id === "account")?.subjects, [
    "user",
    "organization",
  ]);
});

test("planned routes describe the target topology without becoming buildable", () => {
  for (const id of [
    "repository-pulls",
    "repository-pull",
    "repository-discussion",
    "organization-project",
    "organization-people",
    "organization-repositories",
    "organization-packages",
    "organization-discussion",
    "sponsors-account",
    "pulls",
  ]) {
    assert.equal(NAMESPACE_ROUTES.find((route) => route.id === id)?.state, "planned");
  }

  assert.throws(() => buildNamespacePath("repository-pull" as never, {} as never), /is not active/);
  if (false) {
    // @ts-expect-error planned route ids are excluded from the runtime builder contract
    buildNamespacePath("repository-pull", {
      login: "alice",
      repository: "app",
      pullNumber: 1,
    });
  }
});

test("builds active routes from their exact inferred parameters", () => {
  assert.equal(buildNamespacePath("account", { login: "alice" }), "/alice");
  assert.equal(
    buildNamespacePath("repository-issue", {
      login: "alice",
      repository: "line bot",
      issueNumber: 42,
    }),
    "/alice/line%20bot/issues/42",
  );
  assert.equal(
    buildNamespacePath("repository-discussion-id", {
      login: "alice",
      repository: "app",
      discussionId: "discussion%2Fopaque",
    }),
    "/alice/app/discussions/discussion%252Fopaque",
  );
  assert.equal(
    buildNamespacePath("organization-team", { organization: "acme", teamSlug: "core team" }),
    "/orgs/acme/teams/core%20team",
  );
  assert.equal(buildNamespacePath("settings", {}), "/settings");
});

test("type contract rejects missing and extra parameters", () => {
  const valid = {
    login: "alice",
    repository: "app",
    issueNumber: 1,
  };
  assert.equal(buildNamespacePath("repository-issue", valid), "/alice/app/issues/1");

  if (false) {
    // @ts-expect-error issueNumber is required
    buildNamespacePath("repository-issue", { login: "alice", repository: "app" });
    // @ts-expect-error unknown parameters are rejected
    buildNamespacePath("account", { login: "alice", repository: "app" });
    buildNamespacePath("repository-issue", {
      login: "alice",
      repository: "app",
      // @ts-expect-error numeric locators require numbers
      issueNumber: "1",
    });
  }
});

test("rejects unsafe raw path components and numeric locators", () => {
  for (const login of ["", ".", ".."]) {
    assert.throws(() => buildNamespacePath("account", { login }), /one non-empty path segment/);
  }

  for (const issueNumber of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () =>
        buildNamespacePath("repository-issue", {
          login: "alice",
          repository: "app",
          issueNumber,
        }),
      /positive safe integer/,
    );
  }

  assert.throws(() => buildNamespacePath("account", {} as never), /missing: login/);
  assert.throws(
    () => buildNamespacePath("account", { login: "alice", extra: "value" } as never),
    /extra: extra/,
  );
});

test("preserves owner-supported Repository names while encoding separators", () => {
  assert.equal(
    buildNamespacePath("repository-issues", { login: "acme", repository: "Line/Bot v1" }),
    "/acme/Line%2FBot%20v1/issues",
  );
  assert.equal(
    buildNamespacePath("repository", { login: "acme", repository: "Line\\Bot" }),
    "/acme/Line%5CBot",
  );
});

test("rejects Account logins that collide with reserved root projections", () => {
  assert.throws(
    () => buildNamespacePath("account", { login: "stars" }),
    /reserved in the global root namespace/,
  );
  assert.throws(
    () => buildNamespacePath("repository", { login: "issues", repository: "app" }),
    /reserved in the global root namespace/,
  );
  assert.equal(
    buildNamespacePath("repository", { login: "alice", repository: "issues" }),
    "/alice/issues",
  );
});
