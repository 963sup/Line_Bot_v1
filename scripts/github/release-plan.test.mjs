import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findOwnerBaseline,
  githubOutputLines,
  planRelease,
  publicationOnlyRichMenuSource,
  releaseSha,
  richMenuChanged,
  schemaChanged,
} from "./release-plan.mjs";

const SHA = "a".repeat(40);
const PREVIOUS = "b".repeat(40);
const OLD = "c".repeat(40);
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

test("release evidence title accepts only exact Release SHA", () => {
  assert.equal(releaseSha(`Release ${PREVIOUS}`), PREVIOUS);
  assert.equal(releaseSha(`Release ${PREVIOUS.slice(0, 7)}`), null);
  assert.equal(releaseSha(`Other ${PREVIOUS}`), null);
});

test("release source classifiers preserve owner boundaries", () => {
  assert.equal(schemaChanged(["supabase/schemas/200_enterprises.sql"]), true);
  assert.equal(schemaChanged(["scripts/supabase/remote.mjs"]), false);
  assert.equal(richMenuChanged(["assets/line/rich-menu/menu.png"]), true);
  assert.equal(richMenuChanged(["apps/web/src/modules/assistant/rich-menu/definition.ts"]), true);
  assert.equal(publicationOnlyRichMenuSource("apps/web/src/app/page.tsx"), false);
  assert.equal(
    publicationOnlyRichMenuSource("apps/web/src/modules/assistant/rich-menu/definition.ts"),
    true,
  );
  assert.equal(publicationOnlyRichMenuSource("scripts/runtime/next.mjs"), false);
});

test("owner baseline advances only on that owner success and ancestry", async () => {
  const runs = [
    { id: 1, display_title: `Release ${OLD}` },
    { id: 2, display_title: `Release ${PREVIOUS}` },
  ];
  const jobsByRun = new Map([
    [1, [{ name: "supabase", conclusion: "success" }]],
    [2, [{ name: "deployment", conclusion: "success" }]],
  ]);
  const baseline = await findOwnerBaseline({
    owner: "supabase",
    runs,
    targetSha: SHA,
    repository: "963sup/Line_Bot_v1",
    token: "token",
    fetchImpl: async (url) => {
      const id = Number(/actions\/runs\/(\d+)/.exec(String(url))?.[1]);
      return json({ jobs: jobsByRun.get(id) ?? [] });
    },
    git: {
      hasCommit: () => true,
      isAncestor: () => true,
    },
  });
  assert.equal(baseline, OLD);
});

test("Web routing follows Turbo build inputs instead of a scripts denylist", async () => {
  const runs = [{ id: 6, display_title: `Release ${PREVIOUS}` }];
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith("/branches/main")) return json({ commit: { sha: SHA } });
    if (value.includes("/actions/workflows/release.yml/runs?")) {
      return json({ workflow_runs: runs });
    }
    if (value.includes("/actions/runs/6/jobs?")) {
      return json({
        jobs: [
          { name: "supabase", conclusion: "success" },
          { name: "deployment", conclusion: "success" },
          { name: "rich_menu_direct", conclusion: "success" },
        ],
      });
    }
    throw new Error(`Unexpected URL: ${value}`);
  };

  const plan = await planRelease({
    sha: SHA,
    repository: "963sup/Line_Bot_v1",
    token: "token",
    fetchImpl,
    git: {
      hasCommit: () => true,
      isAncestor: () => true,
      changedFiles: () => ["scripts/runtime/next.mjs"],
    },
    turbo: { webBuildAffected: () => true },
  });

  assert.equal(plan.web_affected, true);
  assert.equal(plan.rich_menu_changed, false);
});

test("release plan keeps owner cursors independent and rich menu direct when Web is unchanged", async () => {
  const runs = [{ id: 7, display_title: `Release ${PREVIOUS}` }];
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith("/branches/main")) return json({ commit: { sha: SHA } });
    if (value.includes("/actions/workflows/release.yml/runs?")) {
      return json({ workflow_runs: runs });
    }
    if (value.includes("/actions/runs/7/jobs?")) {
      return json({
        jobs: [
          { name: "supabase", conclusion: "success" },
          { name: "deployment", conclusion: "success" },
          { name: "rich_menu_direct", conclusion: "success" },
        ],
      });
    }
    throw new Error(`Unexpected URL: ${value}`);
  };
  const changed = new Map([[PREVIOUS, ["apps/web/src/modules/assistant/rich-menu/definition.ts"]]]);
  const plan = await planRelease({
    sha: SHA,
    repository: "963sup/Line_Bot_v1",
    token: "token",
    fetchImpl,
    git: {
      hasCommit: () => true,
      isAncestor: () => true,
      changedFiles: (baseline) => changed.get(baseline) ?? [],
    },
    turbo: { webBuildAffected: () => true },
  });
  assert.equal(plan.schema_changed, false);
  assert.equal(plan.web_affected, false);
  assert.equal(plan.rich_menu_changed, true);
  assert.equal(plan.rich_menu_requires_web, false);
  assert.deepEqual(githubOutputLines(plan).slice(1), [
    "schema_changed=false",
    "web_affected=false",
    "rich_menu_changed=true",
    "rich_menu_requires_web=false",
  ]);
});

test("release plan requires Vercel before Rich Menu only when pending Web runtime is affected", async () => {
  const runs = [{ id: 8, display_title: `Release ${PREVIOUS}` }];
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith("/branches/main")) return json({ commit: { sha: SHA } });
    if (value.includes("/actions/workflows/release.yml/runs?")) {
      return json({ workflow_runs: runs });
    }
    if (value.includes("/actions/runs/8/jobs?")) {
      return json({
        jobs: [
          { name: "supabase", conclusion: "success" },
          { name: "deployment", conclusion: "success" },
          { name: "rich_menu_after_deployment", conclusion: "success" },
        ],
      });
    }
    throw new Error(`Unexpected URL: ${value}`);
  };
  const plan = await planRelease({
    sha: SHA,
    repository: "963sup/Line_Bot_v1",
    token: "token",
    fetchImpl,
    git: {
      hasCommit: () => true,
      isAncestor: () => true,
      changedFiles: () => [
        "apps/web/src/app/profile/page.tsx",
        "apps/web/src/modules/assistant/rich-menu/definition.ts",
      ],
    },
    turbo: { webBuildAffected: () => true },
  });
  assert.equal(plan.web_affected, true);
  assert.equal(plan.rich_menu_changed, true);
  assert.equal(plan.rich_menu_requires_web, true);
});
