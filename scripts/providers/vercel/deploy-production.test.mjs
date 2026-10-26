import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  deployProduction,
  parseProductionDeployArgs,
  VERCEL_PRODUCTION_TARGET,
  verifyProductionReleaseAuthorization,
} from "./deploy-production.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
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

const project = () =>
  json({ id: VERCEL_PRODUCTION_TARGET.projectId, name: VERCEL_PRODUCTION_TARGET.projectName });

const ready = (id = "dpl_exact") => ({
  id,
  readyState: "READY",
  state: "READY",
  target: "production",
  url: "mini-app-line-exact.vercel.app",
  alias: [VERCEL_PRODUCTION_TARGET.productionAlias],
  meta: { githubCommitSha: SHA },
});

test("production deploy requires explicit live authorization and exact SHA", () => {
  assert.throws(() => parseProductionDeployArgs(["--sha", SHA]), /--live/);
  assert.throws(() => parseProductionDeployArgs(["--live", "--sha", "main"]), /exact commit SHA/);
  assert.deepEqual(parseProductionDeployArgs(["--live", "--sha", SHA]), { sha: SHA });
});

test("production release authorization accepts only a current planned Release", async () => {
  const responses = [
    json({
      id: 123,
      path: ".github/workflows/release.yml",
      event: "push",
      head_branch: "main",
      head_sha: SHA,
      status: "in_progress",
      run_attempt: 1,
      conclusion: null,
    }),
    json({
      jobs: [
        { name: "release_plan", conclusion: "success" },
        { name: "validation / validate", conclusion: "success" },
      ],
    }),
  ];
  await verifyProductionReleaseAuthorization({
    token: "test-token",
    runId: "123",
    runAttempt: "1",
    sha: SHA,
    repository: "963sup/Line_Bot_v1",
    fetchImpl: async () => responses.shift(),
  });
});

test("an active queued Release can deploy after successful prerequisites from earlier attempts", async () => {
  const calls = [];
  await verifyProductionReleaseAuthorization({
    token: "test-token",
    runId: "123",
    runAttempt: "3",
    sha: SHA,
    repository: "963sup/Line_Bot_v1",
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).endsWith("/runs/123"))
        return json({
          id: 123,
          path: ".github/workflows/release.yml",
          event: "push",
          head_branch: "main",
          head_sha: SHA,
          status: "queued",
          conclusion: null,
          run_attempt: 3,
        });
      assert.match(String(url), /filter=all/);
      return json({
        jobs: [
          { id: 1, run_attempt: 1, name: "validation / validate", conclusion: "success" },
          { id: 2, run_attempt: 1, name: "release_plan", conclusion: "failure" },
          { id: 3, run_attempt: 2, name: "release_plan", conclusion: "success" },
          { id: 4, run_attempt: 3, name: "deployment", conclusion: null },
        ],
      });
    },
  });
  assert.equal(calls.length, 2);
});

test("Release deployment rejects terminal runs, wrong identity and stale attempts before reading jobs", async () => {
  const valid = {
    id: 123,
    path: ".github/workflows/release.yml",
    event: "push",
    head_branch: "main",
    head_sha: SHA,
    status: "queued",
    conclusion: null,
    run_attempt: 3,
  };
  for (const patch of [
    { status: "completed" },
    { status: "waiting" },
    { conclusion: "cancelled" },
    { id: 456 },
    { path: ".github/workflows/validate.yml" },
    { event: "pull_request" },
    { head_branch: "other" },
    { head_sha: "f".repeat(40) },
    { run_attempt: 4 },
  ]) {
    let reads = 0;
    await assert.rejects(
      verifyProductionReleaseAuthorization({
        token: "synthetic",
        runId: "123",
        runAttempt: "3",
        sha: SHA,
        repository: "963sup/Line_Bot_v1",
        fetchImpl: async () => {
          reads++;
          return json({ ...valid, ...patch });
        },
      }),
      /current authorized Release/,
    );
    assert.equal(reads, 1);
  }
  await assert.rejects(
    verifyProductionReleaseAuthorization({
      token: "synthetic",
      runId: "123",
      sha: SHA,
      repository: "963sup/Line_Bot_v1",
    }),
    /GITHUB_RUN_ATTEMPT/,
  );
});

test("production release authorization fails closed before Release planning succeeds", async () => {
  const responses = [
    json({
      id: 123,
      path: ".github/workflows/release.yml",
      event: "push",
      head_branch: "main",
      head_sha: SHA,
      status: "in_progress",
      run_attempt: 1,
      conclusion: null,
    }),
    json({
      jobs: [
        { name: "release_plan", conclusion: "failure" },
        { name: "validation / validate", conclusion: "success" },
      ],
    }),
  ];
  await assert.rejects(
    verifyProductionReleaseAuthorization({
      token: "test-token",
      runId: "123",
      runAttempt: "1",
      sha: SHA,
      repository: "963sup/Line_Bot_v1",
      fetchImpl: async () => responses.shift(),
    }),
    /successful Release planning/,
  );
});

for (const conclusion of ["failure", "cancelled", "skipped", null]) {
  test(`production release rejects ${conclusion} validation despite successful planning`, async () => {
    const responses = [
      json({
        id: 123,
        path: ".github/workflows/release.yml",
        event: "push",
        head_branch: "main",
        head_sha: SHA,
        status: "in_progress",
        run_attempt: 1,
        conclusion: null,
      }),
      json({
        jobs: [
          { name: "release_plan", conclusion: "success" },
          { name: "validation / validate", conclusion },
        ],
      }),
    ];
    await assert.rejects(
      verifyProductionReleaseAuthorization({
        token: "test-token",
        runId: "123",
        runAttempt: "1",
        sha: SHA,
        repository: "963sup/Line_Bot_v1",
        fetchImpl: async () => responses.shift(),
      }),
      /successful full validation/,
    );
  });
}

test("production deploy targets the selected project and reads back the exact SHA", async () => {
  const calls = [];
  const responses = [
    project(),
    json({ deployments: [] }),
    json({ id: "dpl_exact" }, 201),
    json({ id: "dpl_exact", readyState: "BUILDING" }),
    json(ready()),
  ];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return responses.shift();
  };

  const result = await deployProduction({
    token: "test-token",
    sha: SHA,
    fetchImpl,
    sleep: async () => {},
  });

  assert.equal(result.deploymentId, "dpl_exact");
  assert.equal(calls.length, 5);
  assert.match(calls[0].url, new RegExp(VERCEL_PRODUCTION_TARGET.projectId));
  assert.match(calls[1].url, /\/v7\/deployments\?/);
  assert.match(calls[1].url, new RegExp(`sha=${SHA}`));
  const mutation = JSON.parse(calls[2].init.body);
  assert.equal(calls[2].init.method, "POST");
  assert.equal(mutation.project, VERCEL_PRODUCTION_TARGET.projectId);
  assert.equal(mutation.target, "production");
  assert.equal(mutation.gitSource.ref, SHA);
  assert.equal(mutation.gitMetadata.commitSha, SHA);
});

test("production deploy reuses an exact READY production deployment before mutating", async () => {
  const calls = [];
  const responses = [
    project(),
    json({
      deployments: [
        {
          id: "dpl_recovered",
          state: "READY",
          target: "production",
          meta: { githubCommitSha: SHA },
        },
      ],
    }),
    json(ready("dpl_recovered")),
  ];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return responses.shift();
  };

  const result = await deployProduction({
    token: "test-token",
    sha: SHA,
    fetchImpl,
    sleep: async () => {},
  });

  assert.equal(result.deploymentId, "dpl_recovered");
  assert.equal(calls.length, 3);
  assert.equal(
    calls.some((call) => call.init.method === "POST"),
    false,
  );
});

test("production deploy resumes an exact in-flight deployment instead of duplicating it", async () => {
  const calls = [];
  const responses = [
    project(),
    json({
      deployments: [
        {
          id: "dpl_inflight",
          state: "BUILDING",
          target: "production",
          meta: { githubCommitSha: SHA },
        },
      ],
    }),
    json({
      id: "dpl_inflight",
      readyState: "BUILDING",
      target: "production",
      meta: { githubCommitSha: SHA },
    }),
    json(ready("dpl_inflight")),
  ];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return responses.shift();
  };

  const result = await deployProduction({
    token: "test-token",
    sha: SHA,
    fetchImpl,
    sleep: async () => {},
  });

  assert.equal(result.deploymentId, "dpl_inflight");
  assert.equal(
    calls.some((call) => call.init.method === "POST"),
    false,
  );
});

test("production deploy never retries an unknown mutation result inside one invocation", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return project();
    if (calls === 2) return json({ deployments: [] });
    throw new Error("network lost after request");
  };

  await assert.rejects(
    deployProduction({
      token: "test-token",
      sha: SHA,
      fetchImpl,
      sleep: async () => {},
    }),
    /outcome unknown/,
  );
  assert.equal(calls, 3);
});

test("Vercel upload retains the Next.js runtime script dependencies", () => {
  const rules = readFileSync(new URL("../../.vercelignore", import.meta.url), "utf8").split(
    /\r?\n/,
  );
  const next = readFileSync(new URL("../../core/runtime/next.mjs", import.meta.url), "utf8");
  for (const path of [
    "scripts/core/runtime/next.mjs",
    "scripts/core/runtime/load-env.mjs",
    "scripts/core/runtime/bounded-output.mjs",
  ]) {
    assert.ok(rules.includes(`!${path}`), `Vercel upload excludes required runtime input: ${path}`);
  }
  assert.match(next, /from "\.\/bounded-output\.mjs"/);
  assert.match(next, /from "\.\/load-env\.mjs"/);
});

test("Vercel upload retains PostCSS configuration and its local plugin", () => {
  const rules = readFileSync(new URL("../../.vercelignore", import.meta.url), "utf8").split(
    /\r?\n/,
  );
  for (const path of [
    "apps/web/postcss.config.mjs",
    "apps/web/postcss",
    "apps/web/postcss/legacy-modules.cjs",
  ]) {
    assert.ok(
      rules.includes(`!${path}`),
      `Vercel upload excludes required CSS build input: ${path}`,
    );
  }
  const config = readFileSync(
    new URL("../../apps/web/postcss.config.mjs", import.meta.url),
    "utf8",
  );
  assert.match(config, /legacy-modules\.cjs/);
  assert.match(config, /@tailwindcss\/postcss/);
});

test("Vercel upload retains the public integration package used by Web composition", () => {
  const rules = readFileSync(new URL("../../.vercelignore", import.meta.url), "utf8").split(
    /\r?\n/,
  );
  for (const path of [
    "packages",
    "packages/*",
    "packages/*/package.json",
    "packages/*/src",
    "packages/*/src/**",
  ]) {
    assert.ok(rules.includes(`!${path}`), `Vercel upload excludes integration input: ${path}`);
  }
  const manifest = JSON.parse(
    readFileSync(
      new URL("../../packages/integration-vercel/package.json", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(manifest.exports["./gateway"]);
  assert.ok(manifest.exports["./gateway-config"]);
  const web = JSON.parse(
    readFileSync(new URL("../../apps/web/package.json", import.meta.url), "utf8"),
  );
  assert.equal(web.dependencies["@line_bot_v1/integration-vercel"], "workspace:*");
  for (const file of ["assistant.server.ts", "expense.server.ts", "files.server.ts"]) {
    const consumer = readFileSync(
      new URL(`../../apps/web/src/app/api/_composition/${file}`, import.meta.url),
      "utf8",
    );
    assert.match(consumer, /@line_bot_v1\/integration-vercel\/gateway/);
    assert.match(consumer, /@line_bot_v1\/integration-vercel\/gateway-config/);
  }
});

test("Vercel Git integration deploys unspecified branches but leaves main to the Release workflow", () => {
  const config = JSON.parse(
    readFileSync(new URL("../../apps/web/vercel.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(config.git.deploymentEnabled, {
    main: false,
    preview: true,
    "preview/**": true,
  });
});
