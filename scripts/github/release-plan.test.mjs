import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findOwnerBaseline,
  githubOutputLines,
  planRelease,
  publicationOnlyRichMenuSource,
  releaseSha,
  richMenuChanged,
  schedulerChanged,
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

test("successful owner jobs advance independently while other jobs in the Release still run", async () => {
  const plan = await planRelease({
    sha: SHA,
    repository: "963sup/Line_Bot_v1",
    token: "token",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/branches/main")) return json({ commit: { sha: SHA } });
      if (parsed.pathname.endsWith("/workflows/release.yml/runs")) {
        // Model the API filters: a completed-only or workflow_run-only query loses this evidence.
        const visible = !parsed.searchParams.has("status") && !parsed.searchParams.has("event");
        return json({
          workflow_runs: visible
            ? [
                {
                  id: 10,
                  display_title: `Release ${PREVIOUS}`,
                  event: "push",
                  status: "in_progress",
                },
              ]
            : [],
        });
      }
      if (parsed.pathname.endsWith("/runs/10/jobs"))
        return json({
          jobs: [
            { name: "rich_menu", conclusion: "success" },
            { name: "supabase", conclusion: null },
          ],
        });
      throw new Error(`Unexpected URL: ${url}`);
    },
    git: {
      hasCommit: () => true,
      isAncestor: () => true,
      changedFiles: (baseline) =>
        baseline ? [] : ["assets/line/rich-menu/menu.png", "supabase/schemas/200_enterprises.sql"],
    },
    turbo: { webBuildAffected: () => false },
  });
  assert.equal(plan.baselines.rich_menu, PREVIOUS);
  assert.equal(plan.rich_menu_changed, false);
  assert.equal(plan.baselines.supabase, null);
  assert.equal(plan.schema_changed, true);
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
          { name: "rich_menu", conclusion: "success" },
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
  assert.equal(plan.scheduler_changed, false);
  assert.deepEqual(githubOutputLines(plan).slice(1), [
    "schema_changed=false",
    "web_affected=false",
    "rich_menu_changed=true",
    "scheduler_changed=false",
  ]);
});

test("release plan keeps Rich Menu and Web as independent pending operations", async () => {
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
  assert.equal(Object.hasOwn(plan, "rich_menu_requires_web"), false);
  assert.equal(plan.scheduler_changed, true);
});

function plannerFixture({ files = [], previousJobs, runs, byBaseline, affected = false } = {}) {
  const allRuns = runs ?? [{ id: 1, display_title: `Release ${PREVIOUS}` }];
  const jobs =
    previousJobs ??
    ["supabase", "deployment", "rich_menu", "attendance_scheduler"].map((name) => ({
      name,
      conclusion: "success",
    }));
  return {
    sha: SHA,
    repository: "963sup/Line_Bot_v1",
    token: "token",
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.endsWith("/branches/main")) return json({ commit: { sha: SHA } });
      if (value.includes("/actions/workflows/release.yml/runs?")) {
        const page = Number(new URL(value).searchParams.get("page"));
        return json({ workflow_runs: allRuns.slice((page - 1) * 100, page * 100) });
      }
      if (value.includes("/jobs?")) return json({ jobs });
      throw Error(`Unexpected URL ${url}`);
    },
    git: {
      hasCommit: () => true,
      isAncestor: () => true,
      changedFiles: (baseline) => (byBaseline ? byBaseline(baseline) : files),
    },
    turbo: { webBuildAffected: () => affected },
  };
}

test("schema-only changes sync schema without publishing Rich Menu or deploying Web", async () => {
  const plan = await planRelease(plannerFixture({ files: ["supabase/schemas/100_accounts.sql"] }));
  assert.equal(plan.schema_changed, true);
  assert.equal(plan.web_affected, false);
  assert.equal(plan.rich_menu_changed, false);
});

test("each current Rich Menu asset triggers independent publication even when Turbo is affected", async () => {
  for (const page of [
    "attendance-in",
    "attendance-out",
    "forms",
    "incident",
    "notifications",
    "team",
  ]) {
    const plan = await planRelease(
      plannerFixture({ files: [`assets/line/rich-menu/line_bot_v1-${page}.png`], affected: true }),
    );
    assert.equal(plan.rich_menu_changed, true, page);
    assert.equal(plan.web_affected, false, page);
    assert.equal(plan.schema_changed, false, page);
    assert.equal(plan.scheduler_changed, false, page);
  }
});

test("unrelated docs and tests trigger no remote operations", async () => {
  const plan = await planRelease(
    plannerFixture({ files: ["README.md", "scripts/line/rich-menu/sync.test.ts"] }),
  );
  for (const key of ["schema_changed", "web_affected", "rich_menu_changed", "scheduler_changed"]) {
    assert.equal(plan[key], false, key);
  }
});

test("Rich Menu watches publication code and its actual inputs", () => {
  for (const file of [
    "scripts/line/rich-menu/sync.ts",
    "apps/web/src/modules/assistant/rich-menu/publication.server.ts",
    "apps/web/src/modules/assistant/rich-menu/operator.server.ts",
    "packages/line-channel/src/mini-app/registration.ts",
    "apps/web/src/shared/presentation/entry-route.ts",
    "packages/line-channel/src/rich-menu/client.ts",
    "packages/line-channel/src/rich-menu/image.ts",
    "scripts/runtime/load-env.mjs",
    "pnpm-lock.yaml",
  ])
    assert.equal(richMenuChanged([file]), true, file);
  for (const file of [
    "scripts/line/rich-menu/README.md",
    "scripts/line/rich-menu/sync.test.ts",
    "apps/web/src/modules/assistant/rich-menu/publication.server.test.ts",
    "packages/line-channel/src/adapters/messaging/line-webhook-parser.ts",
    "apps/web/src/app/page.tsx",
  ])
    assert.equal(richMenuChanged([file]), false, file);
  assert.equal(schemaChanged(["supabase/schemas/nested/100.sql"]), false);
  assert.equal(schedulerChanged(["scripts/attendance/scheduler.test.mjs"]), false);
});

test("failed and skipped publications retain pending changes", async () => {
  for (const conclusion of ["failure", "skipped", "cancelled"]) {
    const plan = await planRelease(
      plannerFixture({
        previousJobs: [{ name: "rich_menu", conclusion }],
        byBaseline: (baseline) => (baseline === null ? ["assets/line/rich-menu/home.png"] : []),
      }),
    );
    assert.equal(plan.baselines.rich_menu, null);
    assert.equal(plan.rich_menu_changed, true);
  }
});

test("successful same-SHA publication is not repeated on rerun", async () => {
  const plan = await planRelease(
    plannerFixture({
      runs: [{ id: 1, display_title: `Release ${SHA}` }],
      byBaseline: (baseline) => (baseline === SHA ? [] : ["supabase/schemas/100.sql"]),
    }),
  );
  assert.equal(plan.baselines.supabase, SHA);
  assert.equal(plan.schema_changed, false);
});

test("publication cursor survives more than one page of unrelated releases", async () => {
  const runs = Array.from({ length: 100 }, (_, i) => ({ id: i + 2, display_title: "unrelated" }));
  runs.push({ id: 1, display_title: `Release ${PREVIOUS}` });
  const plan = await planRelease(plannerFixture({ runs }));
  assert.equal(plan.baselines.supabase, PREVIOUS);
  assert.equal(plan.schema_changed, false);
});

test("failed scheduler still retries after Web deployment has already succeeded", async () => {
  const plan = await planRelease(
    plannerFixture({
      previousJobs: [{ name: "deployment", conclusion: "success" }],
      byBaseline: (baseline) =>
        baseline === PREVIOUS
          ? []
          : ["apps/web/src/app/api/internal/attendance-maintenance/route.ts"],
      affected: true,
    }),
  );
  assert.equal(plan.web_affected, false);
  assert.equal(plan.scheduler_changed, true);
});
