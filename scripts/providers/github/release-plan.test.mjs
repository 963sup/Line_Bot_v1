import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  storageChanged,
} from "./release-plan.mjs";

const SHA = "a".repeat(40);
const PREVIOUS = "b".repeat(40);
const OLD = "c".repeat(40);
const json = (body, status = 200) =>
  new Response(
    JSON.stringify(
      body.jobs
        ? {
            ...body,
            jobs: body.jobs.map((job, index) => ({ id: index + 1, run_attempt: 1, ...job })),
          }
        : body,
    ),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );

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
        baseline
          ? []
          : [
              "assets/line/rich-menu/menu.jpg",
              "packages/integration-supabase/src/schemas/200_enterprises.sql",
            ],
    },
    turbo: { webBuildAffected: () => false },
  });
  assert.equal(plan.baselines.rich_menu, PREVIOUS);
  assert.equal(plan.rich_menu_changed, false);
  assert.equal(plan.baselines.supabase, null);
  assert.equal(plan.schema_changed, true);
});

test("release source classifiers preserve owner boundaries", () => {
  assert.equal(
    schemaChanged(["packages/integration-supabase/src/schemas/200_enterprises.sql"]),
    true,
  );
  assert.equal(schemaChanged(["scripts/providers/supabase/remote.mjs"]), false);
  assert.equal(storageChanged(["packages/integration-supabase/src/config.toml"]), true);
  assert.equal(storageChanged(["scripts/providers/supabase/storage.mjs"]), true);
  assert.equal(storageChanged(["scripts/providers/supabase/storage.test.mjs"]), false);
  assert.equal(storageChanged(["packages/integration-supabase/src/schemas/615_files.sql"]), false);
  assert.equal(richMenuChanged(["assets/line/rich-menu/menu.jpg"]), true);
  assert.equal(richMenuChanged(["apps/web/src/modules/assistant/rich-menu/definition.ts"]), true);
  assert.equal(publicationOnlyRichMenuSource("apps/web/src/app/page.tsx"), false);
  assert.equal(
    publicationOnlyRichMenuSource("apps/web/src/modules/assistant/rich-menu/definition.ts"),
    true,
  );
  assert.equal(publicationOnlyRichMenuSource("scripts/core/runtime/next.mjs"), false);
});

test("owner baseline advances only on that owner success and ancestry", async () => {
  const runs = [
    { id: 1, display_title: `Release ${OLD}`, status: "completed" },
    { id: 2, display_title: `Release ${PREVIOUS}`, status: "completed" },
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
  const runs = [{ id: 6, display_title: `Release ${PREVIOUS}`, status: "completed" }];
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
      changedFiles: () => ["scripts/core/runtime/next.mjs"],
    },
    turbo: { webBuildAffected: () => true },
  });

  assert.equal(plan.web_affected, true);
  assert.equal(plan.rich_menu_changed, false);
});

test("release plan keeps owner cursors independent and rich menu direct when Web is unchanged", async () => {
  const runs = [{ id: 7, display_title: `Release ${PREVIOUS}`, status: "completed" }];
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
  assert.equal(plan.scheduler_changed, false);
  assert.deepEqual(githubOutputLines(plan).slice(1), [
    "schema_changed=false",
    "storage_changed=false",
    "web_affected=false",
    "rich_menu_changed=true",
    "rich_menu_requires_web=false",
    "scheduler_changed=false",
  ]);
});

test("release plan keeps Rich Menu and Web as independent pending operations", async () => {
  const runs = [{ id: 8, display_title: `Release ${PREVIOUS}`, status: "completed" }];
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
  assert.equal(plan.scheduler_changed, true);
});

function plannerFixture({
  files = [],
  previousJobs,
  jobsByRun,
  runs,
  byBaseline,
  affected = false,
} = {}) {
  const allRuns = runs ?? [{ id: 1, display_title: `Release ${PREVIOUS}`, status: "completed" }];
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
      if (value.includes("/jobs?")) {
        const runId = Number(/\/actions\/runs\/(\d+)\/jobs/.exec(value)?.[1]);
        return json({ jobs: jobsByRun?.get(runId) ?? jobs });
      }
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
  const plan = await planRelease(
    plannerFixture({ files: ["packages/integration-supabase/src/schemas/100_accounts.sql"] }),
  );
  assert.equal(plan.schema_changed, true);
  assert.equal(plan.web_affected, false);
  assert.equal(plan.rich_menu_changed, false);
});

test("Rich Menu fails closed when no compatible Web deployment baseline exists", async () => {
  const plan = await planRelease(
    plannerFixture({
      runs: [],
      files: ["assets/line/rich-menu/line_bot_v1-forms.jpg"],
      affected: false,
    }),
  );
  assert.equal(plan.rich_menu_changed, true);
  assert.equal(plan.web_affected, false);
  assert.equal(plan.rich_menu_requires_web, true);
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
      plannerFixture({ files: [`assets/line/rich-menu/line_bot_v1-${page}.jpg`], affected: true }),
    );
    assert.equal(plan.rich_menu_changed, true, page);
    assert.equal(plan.web_affected, false, page);
    assert.equal(plan.schema_changed, false, page);
    assert.equal(plan.scheduler_changed, false, page);
  }
});

test("Storage Bucket changes publish separately from declarative SQL and Web", async () => {
  const plan = await planRelease(
    plannerFixture({ files: ["packages/integration-supabase/src/config.toml"] }),
  );
  assert.equal(plan.schema_changed, false);
  assert.equal(plan.storage_changed, true);
  assert.equal(plan.web_affected, false);
  assert.equal(plan.rich_menu_changed, false);
  assert.equal(plan.scheduler_changed, false);
});

test("Storage tracks its own successful Release baseline", async () => {
  const plan = await planRelease(
    plannerFixture({
      previousJobs: [{ name: "supabase_storage", conclusion: "success" }],
      byBaseline: (baseline) =>
        baseline === PREVIOUS ? [] : ["packages/integration-supabase/src/config.toml"],
    }),
  );
  assert.equal(plan.baselines.storage, PREVIOUS);
  assert.equal(plan.storage_changed, false);
  assert.equal(plan.schema_changed, false);
});

test("unrelated docs and tests trigger no remote operations", async () => {
  const plan = await planRelease(
    plannerFixture({ files: ["README.md", "scripts/providers/line/rich-menu/sync.test.ts"] }),
  );
  for (const key of [
    "schema_changed",
    "storage_changed",
    "web_affected",
    "rich_menu_changed",
    "scheduler_changed",
  ]) {
    assert.equal(plan[key], false, key);
  }
});

test("Rich Menu watches publication code and its actual inputs", () => {
  for (const file of [
    "scripts/providers/line/rich-menu/sync.ts",
    "apps/web/src/modules/assistant/rich-menu/publication.server.ts",
    "apps/web/src/modules/assistant/rich-menu/operator.server.ts",
    "packages/line/src/mini-app/registration.ts",
    "apps/web/src/shared/presentation/entry-route.ts",
    "packages/line/src/rich-menu/alias.ts",
    "packages/line/src/rich-menu/client.ts",
    "packages/line/src/rich-menu/image.ts",
    "packages/line/src/rich-menu/menu.ts",
    "packages/line/src/rich-menu/transport.ts",
    "packages/line/src/rich-menu/user-link.ts",
    "scripts/core/runtime/load-env.mjs",
    "pnpm-lock.yaml",
  ])
    assert.equal(richMenuChanged([file]), true, file);
  for (const file of [
    "scripts/providers/line/rich-menu/README.md",
    "scripts/providers/line/rich-menu/sync.test.ts",
    "apps/web/src/modules/assistant/rich-menu/publication.server.test.ts",
    "packages/line/src/rich-menu/types.ts",
    "packages/line/src/adapters/messaging/line-webhook-parser.ts",
    "apps/web/src/app/page.tsx",
  ])
    assert.equal(richMenuChanged([file]), false, file);
  assert.equal(schemaChanged(["packages/integration-supabase/src/schemas/nested/100.sql"]), false);
  assert.equal(schedulerChanged(["scripts/operations/attendance/scheduler.test.mjs"]), false);
});

test("failed and skipped publications retain pending changes", async () => {
  for (const conclusion of ["failure", "skipped", "cancelled"]) {
    const plan = await planRelease(
      plannerFixture({
        previousJobs: [{ name: "rich_menu", conclusion }],
        byBaseline: (baseline) => (baseline === null ? ["assets/line/rich-menu/home.jpg"] : []),
      }),
    );
    assert.equal(plan.baselines.rich_menu, null);
    assert.equal(plan.rich_menu_changed, true);
  }
});

test("failed identifier activation keeps Web deployment pending for a later non-Web commit", async () => {
  for (const conclusion of ["failure", "cancelled", "skipped"]) {
    const plan = await planRelease(
      plannerFixture({
        runs: [
          { id: 2, display_title: `Release ${PREVIOUS}`, status: "completed" },
          { id: 1, display_title: `Release ${OLD}`, status: "completed" },
        ],
        jobsByRun: new Map([
          [
            2,
            [
              { name: "deployment", conclusion: "success" },
              { name: "identifier_runtime_activation", conclusion },
            ],
          ],
          [1, [{ name: "deployment", conclusion: "success" }]],
        ]),
        byBaseline: (baseline) =>
          baseline === OLD ? ["apps/web/src/app/page.tsx", "README.md"] : ["README.md"],
        affected: true,
      }),
    );
    assert.equal(plan.baselines.deployment, OLD, conclusion);
    assert.equal(plan.web_affected, true, conclusion);
  }
});

test("successful identifier activation acknowledges the paired Web deployment baseline", async () => {
  const plan = await planRelease(
    plannerFixture({
      runs: [
        { id: 2, display_title: `Release ${PREVIOUS}`, status: "completed" },
        { id: 1, display_title: `Release ${OLD}`, status: "completed" },
      ],
      jobsByRun: new Map([
        [
          2,
          [
            { name: "deployment", conclusion: "success" },
            { name: "identifier_runtime_activation", conclusion: "success" },
          ],
        ],
        [1, [{ name: "deployment", conclusion: "success" }]],
      ]),
      byBaseline: (baseline) => (baseline === PREVIOUS ? ["README.md"] : []),
      affected: false,
    }),
  );
  assert.equal(plan.baselines.deployment, PREVIOUS);
  assert.equal(plan.web_affected, false);
});

test("identifier activation cannot record a Web baseline without an actual deployment", async () => {
  const plan = await planRelease(
    plannerFixture({
      runs: [
        { id: 2, display_title: `Release ${PREVIOUS}`, status: "completed" },
        { id: 1, display_title: `Release ${OLD}`, status: "completed" },
      ],
      jobsByRun: new Map([
        [
          2,
          [
            { name: "deployment", conclusion: "skipped" },
            { name: "identifier_runtime_activation", conclusion: "success" },
          ],
        ],
        [1, [{ name: "deployment", conclusion: "success" }]],
      ]),
      byBaseline: (baseline) => (baseline === OLD ? ["apps/web/src/app/page.tsx"] : []),
      affected: true,
    }),
  );
  assert.equal(plan.baselines.deployment, OLD);
  assert.equal(plan.web_affected, true);
});

test("an in-progress new Release cannot masquerade as legacy before activation is visible", async () => {
  const plan = await planRelease(
    plannerFixture({
      runs: [
        { id: 2, display_title: `Release ${PREVIOUS}`, status: "in_progress" },
        { id: 1, display_title: `Release ${OLD}`, status: "completed" },
      ],
      jobsByRun: new Map([
        [2, [{ name: "deployment", conclusion: "success" }]],
        [1, [{ name: "deployment", conclusion: "success" }]],
      ]),
      byBaseline: (baseline) => (baseline === OLD ? ["apps/web/src/app/page.tsx"] : []),
      affected: true,
    }),
  );
  assert.equal(plan.baselines.deployment, OLD);
  assert.equal(plan.web_affected, true);
});

test("missing Release status cannot masquerade as completed legacy deployment evidence", async () => {
  const plan = await planRelease(
    plannerFixture({
      runs: [
        { id: 2, display_title: `Release ${PREVIOUS}` },
        { id: 1, display_title: `Release ${OLD}`, status: "completed" },
      ],
      jobsByRun: new Map([
        [2, [{ name: "deployment", conclusion: "success" }]],
        [1, [{ name: "deployment", conclusion: "success" }]],
      ]),
      byBaseline: (baseline) => (baseline === OLD ? ["apps/web/src/app/page.tsx"] : []),
      affected: true,
    }),
  );
  assert.equal(plan.baselines.deployment, OLD);
  assert.equal(plan.web_affected, true);
});

test("successful same-SHA publication is not repeated on rerun", async () => {
  const plan = await planRelease(
    plannerFixture({
      runs: [{ id: 1, display_title: `Release ${SHA}`, status: "completed" }],
      byBaseline: (baseline) =>
        baseline === SHA ? [] : ["packages/integration-supabase/src/schemas/100.sql"],
    }),
  );
  assert.equal(plan.baselines.supabase, SHA);
  assert.equal(plan.schema_changed, false);
});

test("publication cursor survives more than one page of unrelated releases", async () => {
  const runs = Array.from({ length: 100 }, (_, i) => ({ id: i + 2, display_title: "unrelated" }));
  runs.push({ id: 1, display_title: `Release ${PREVIOUS}`, status: "completed" });
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

test("upload-only changes schedule Web without schema or Rich Menu publication", async () => {
  const turbo = JSON.parse(readFileSync(new URL("../../turbo.json", import.meta.url), "utf8"));
  assert.ok(
    turbo.tasks["@line_bot_v1/web#build"].inputs.includes("$TURBO_ROOT$/.vercelignore"),
    "Web build must track its deployment upload policy",
  );
  const plan = await planRelease(plannerFixture({ files: [".vercelignore"], affected: true }));
  assert.equal(plan.web_affected, true);
  assert.equal(plan.schema_changed, false);
  assert.equal(plan.rich_menu_changed, false);
});
