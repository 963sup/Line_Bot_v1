import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  compileSemanticArchitecture,
  validateSemanticArchitecture,
  validateSemanticFilesystem,
} from "./semantic-core.mjs";
import { diffSemanticModels } from "./semantic-diff.mjs";
import { diffSemanticBenchmark } from "./semantic-drift.mjs";
import { compareSemanticFeedback } from "./semantic-feedback.mjs";
import { compileAgentContext, planSemanticChange } from "./semantic-planning.mjs";
import { renderSemanticView, routeFileToUrl } from "./semantic-projection.mjs";
import { querySemanticArchitecture } from "./semantic-query.mjs";

function fixture() {
  const benchmark = {
    version: 2,
    role: "derived-general-management-semantic-benchmark",
    contract: { productAuthority: false },
    nodes: [{ id: "repository" }],
  };
  const topology = {
    version: 2,
    role: "implementation-topology",
    semanticModel: "architecture/semantic-model.json",
    modules: {
      "@line-work/repository": {
        path: "packages/repository",
        moduleKind: "domain-module",
        semanticOwner: "repository",
        allowedWorkspaceDependencies: [],
      },
    },
    applications: {},
  };
  const model = {
    version: 1,
    role: "canonical-product-semantic-architecture",
    conceptTypes: [{ id: "authoritative", authorityMode: "authoritative" }],
    boundaryTypes: [
      { id: "semantic" },
      { id: "module" },
      { id: "data" },
      { id: "consistency" },
      { id: "transaction" },
      { id: "trust" },
      { id: "runtime" },
    ],
    integrationModes: [{ id: "reference" }],
    contractModel: {
      requiredRelationshipFields: [
        "id",
        "provider",
        "consumer",
        "meaning",
        "integrationMode",
        "authority",
        "consistency",
      ],
    },
    evidenceModel: {
      classes: [{ id: "architecture" }, { id: "runtime" }],
      validationProfiles: [
        {
          id: "semantic-architecture",
          command: "pnpm semantic check",
          evidenceClass: "architecture",
          proves: ["semantic consistency"],
        },
      ],
      feedback: {
        bundleVersion: 1,
        claimSubject: "capability",
        statuses: ["pass", "fail", "unknown"],
        revisionProposal: { derived: true, autoApply: false },
        channels: [
          { id: "runtime", evidenceClass: "runtime", mayRevise: ["capability assumptions"] },
        ],
      },
    },
    semanticOwners: [
      { id: "repository", lifecycle: "current" },
      { id: "project", lifecycle: "current-data-only" },
    ],
    boundedContexts: [{ id: "work", owner: "repository", status: "candidate" }],
    concepts: [
      {
        id: "repository",
        canonicalName: "Repository",
        kind: "authoritative",
        authorityMode: "authoritative",
        owner: "repository",
        lifecycle: "current",
        benchmark: { node: "repository" },
      },
      {
        id: "project",
        canonicalName: "Project",
        kind: "authoritative",
        authorityMode: "authoritative",
        owner: "project",
        lifecycle: "current-data-only",
      },
    ],
    relationships: [
      {
        id: "project-repository",
        provider: "repository",
        consumer: "project",
        authority: "repository",
        meaning: "Project references Repository without taking authority.",
        integrationMode: "reference",
        consistency: "current-identity",
      },
    ],
    capabilities: [
      {
        id: "manage-repository",
        owner: "repository",
        kind: "leaf",
        runtimeExpectation: "required",
        intent: "Manage repository.",
        preserves: ["K1"],
        validationProfiles: ["semantic-architecture"],
        implementation: {
          status: "implemented",
          scope: "fixture",
          sourcePaths: ["packages/repository/src/application/issues.ts"],
          publicExports: ["./application/issues"],
          entrypoints: [],
          testPaths: [],
          note: "fixture",
        },
      },
      {
        id: "manage-project-planning",
        owner: "project",
        kind: "leaf",
        runtimeExpectation: "not-asserted",
        intent: "Plan project.",
        preserves: ["K1"],
        validationProfiles: ["semantic-architecture"],
        implementation: {
          status: "data-only",
          scope: "fixture",
          sourcePaths: [],
          publicExports: [],
          entrypoints: [],
          testPaths: [],
          note: "fixture",
        },
      },
    ],
    invariants: [{ id: "K1", tags: ["architecture"] }],
    truthRegistry: [{ id: "business-definition", authority: "architecture/semantic-model.json" }],
    policies: [
      { id: "SEM-001", rationale: "fixture", remediation: "fixture", kind: "single-concept-owner" },
      {
        id: "SEM-002",
        rationale: "fixture",
        remediation: "fixture",
        kind: "relationship-endpoints-exist",
      },
      {
        id: "SEM-003",
        rationale: "fixture",
        remediation: "fixture",
        kind: "benchmark-mapping-must-exist",
      },
      {
        id: "SEM-004",
        rationale: "fixture",
        remediation: "fixture",
        kind: "derived-concept-cannot-be-authoritative",
      },
      {
        id: "SEM-005",
        rationale: "fixture",
        remediation: "fixture",
        kind: "implementation-mapping-must-resolve",
      },
      {
        id: "SEM-006",
        rationale: "fixture",
        remediation: "fixture",
        kind: "module-owner-must-resolve",
      },
      {
        id: "SEM-007",
        rationale: "fixture",
        remediation: "fixture",
        kind: "selected-target-module-not-required",
      },
      {
        id: "SEM-008",
        rationale: "fixture",
        remediation: "fixture",
        kind: "workspace-dependency-must-resolve",
      },
      { id: "SEM-009", rationale: "fixture", remediation: "fixture", kind: "consumer-contract" },
      {
        id: "SEM-010",
        rationale: "fixture",
        remediation: "fixture",
        kind: "evidence-scope-integrity",
      },
      {
        id: "SEM-011",
        rationale: "fixture",
        remediation: "fixture",
        kind: "runtime-feedback-derived-proposal",
      },
    ],
    implementationMappings: [
      { semanticOwner: "repository", module: "@line-work/repository" },
      { semanticOwner: "project", module: null },
    ],
  };
  return { model, benchmark, topology };
}

test("accepts separated semantic, implementation and benchmark authority", () => {
  const { model, benchmark, topology } = fixture();
  assert.deepEqual(validateSemanticArchitecture(model, benchmark, topology), []);
});

test("rejects required runtime capability without implemented source and export evidence", () => {
  const { model, benchmark, topology } = fixture();
  model.capabilities[0].implementation.sourcePaths = [];
  assert.match(
    validateSemanticArchitecture(model, benchmark, topology).join("\n"),
    /required runtime expectation needs implemented sourcePaths and publicExports evidence/,
  );
});

test("rejects aggregate capabilities with cross-owner or non-leaf members", () => {
  const { model, benchmark, topology } = fixture();
  model.capabilities.push({
    id: "repository-family",
    owner: "repository",
    kind: "aggregate",
    runtimeExpectation: "required",
    intent: "fixture aggregate",
    preserves: ["K1"],
    validationProfiles: ["semantic-architecture"],
    members: ["manage-repository", "manage-project-planning"],
  });
  assert.match(
    validateSemanticArchitecture(model, benchmark, topology).join("\n"),
    /has different owner/,
  );
});

test("rejects benchmark items without explicit concept mapping or product decision", () => {
  const { model, benchmark, topology } = fixture();
  benchmark.nodes.push({ id: "discussion" });
  assert.match(
    validateSemanticArchitecture(model, benchmark, topology).join("\n"),
    /Benchmark decision missing explicit disposition for node:discussion/,
  );
  model.benchmarkDecisions = [
    { id: "repository", kind: "node", status: "adopted", concepts: ["repository"], reason: "x" },
  ];
  assert.match(
    validateSemanticArchitecture(model, benchmark, topology).join("\n"),
    /mapped benchmark nodes must not be duplicated/,
  );
});

test("rejects active locators for data-only or target concepts", () => {
  const { model, benchmark, topology } = fixture();
  model.locators = [
    {
      id: "project-url",
      concept: "project",
      status: "active",
      fields: ["number"],
      scope: "fixture",
      routeFiles: ["apps/web/src/app/(app)/projects/[number]/page.tsx"],
      benchmark: { file: "schema-projects.json", category: "projects", symbol: "ProjectV2" },
    },
  ];
  benchmark.sourceInventory = [
    { file: "schema-projects.json", category: "projects", disposition: "included" },
  ];
  assert.match(
    validateSemanticArchitecture(model, benchmark, topology).join("\n"),
    /inactive concept lifecycle cannot claim active locator/,
  );
});

test("rejects active current locators without route evidence", () => {
  const { model, benchmark, topology } = fixture();
  model.locators = [
    {
      id: "repository-url",
      concept: "repository",
      status: "active",
      fields: ["owner", "name"],
      scope: "fixture",
      routeFiles: [],
    },
  ];
  assert.match(
    validateSemanticArchitecture(model, benchmark, topology).join("\n"),
    /active locator requires routeFiles/,
  );
});

test("rejects lifecycle typos before lifecycle-dependent guards run", () => {
  const { model, benchmark, topology } = fixture();
  model.semanticOwners[0].lifecycle = "selected-targte";
  model.concepts[0].lifecycle = "current-dtaa-only";
  assert.match(
    validateSemanticArchitecture(model, benchmark, topology).join("\n"),
    /unsupported lifecycle/,
  );
});

test("rejects deferred benchmark decisions that still carry product basis", () => {
  const { model, benchmark, topology } = fixture();
  benchmark.nodes.push({ id: "discussion" });
  model.benchmarkDecisions = [
    {
      id: "discussion",
      kind: "node",
      status: "deferred",
      concepts: ["repository"],
      reason: "fixture",
    },
  ];
  assert.match(
    validateSemanticArchitecture(model, benchmark, topology).join("\n"),
    /only adopted decisions may carry product basis/,
  );
});

test("rejects and repairs mixed leaf and aggregate evidence shapes", () => {
  const { model, benchmark, topology } = fixture();
  const leaf = model.capabilities[0];
  leaf.members = [model.capabilities[1].id];
  assert.match(
    validateSemanticArchitecture(model, benchmark, topology).join("\n"),
    /leaf must not declare aggregate members/,
  );
  delete leaf.members;
  const aggregate = {
    id: "family",
    owner: leaf.owner,
    kind: "aggregate",
    intent: "Group the current owner capability.",
    runtimeExpectation: "not-asserted",
    preserves: leaf.preserves,
    validationProfiles: leaf.validationProfiles,
    members: [leaf.id],
    implementation: leaf.implementation,
  };
  model.capabilities.push(aggregate);
  assert.match(
    validateSemanticArchitecture(model, benchmark, topology).join("\n"),
    /aggregate must not declare leaf implementation/,
  );
  delete aggregate.implementation;
  assert.deepEqual(validateSemanticArchitecture(model, benchmark, topology), []);
});

test("rejects a module pretending to be a bounded context", () => {
  const { model, benchmark, topology } = fixture();
  topology.modules["@line-work/repository"].moduleKind = "bounded-context";
  assert.match(
    validateSemanticArchitecture(model, benchmark, topology).join("\n"),
    /must not masquerade/,
  );
});

test("rejects unknown benchmark adoption", () => {
  const { model, benchmark, topology } = fixture();
  model.concepts[0].benchmark.node = "missing";
  assert.match(
    validateSemanticArchitecture(model, benchmark, topology).join("\n"),
    /missing benchmark node/,
  );
});

test("cross-owner workspace dependencies require an explicit semantic relationship contract", () => {
  const { model, benchmark, topology } = fixture();
  topology.modules["@line-work/project"] = {
    path: "packages/project",
    moduleKind: "domain-module",
    semanticOwner: "project",
    allowedWorkspaceDependencies: [],
  };
  topology.modules["@line-work/repository"].allowedWorkspaceDependencies = ["@line-work/project"];
  model.implementationMappings.find((mapping) => mapping.semanticOwner === "project").module =
    "@line-work/project";

  assert.deepEqual(validateSemanticArchitecture(model, benchmark, topology), []);

  model.relationships = [
    {
      id: "repository-self",
      provider: "repository",
      consumer: "repository",
      authority: "repository",
      meaning: "Unrelated fixture relationship.",
      integrationMode: "reference",
      consistency: "current-identity",
    },
  ];
  assert.match(
    validateSemanticArchitecture(model, benchmark, topology).join("\n"),
    /cross-owner dependency @line-work\/project .* lacks explicit semantic relationship contract/,
  );
});

test("rejects topology semantic owners that do not resolve", () => {
  const { model, benchmark, topology } = fixture();
  topology.modules["@line-work/repository"].semanticOwner = "missing";
  assert.match(
    validateSemanticArchitecture(model, benchmark, topology).join("\n"),
    /semanticOwner must resolve/,
  );
});

test("query path and impact are derived from compiled relationships", () => {
  const { model, benchmark, topology } = fixture();
  const compiled = compileSemanticArchitecture(model, benchmark, topology);
  assert.deepEqual(querySemanticArchitecture(compiled, "path", ["repository", "project"]), [
    "repository",
    "project",
  ]);
  const impact = querySemanticArchitecture(compiled, "impact", ["repository"]);
  assert.equal(impact.owner.id, "repository");
  assert.deepEqual(impact.direct, [{ owner: "project", path: ["repository", "project"] }]);
  assert.equal(impact.implementation.module, "@line-work/repository");
});

test("semantic diff classifies ownership changes as breaking", () => {
  const { model } = fixture();
  const changed = structuredClone(model);
  changed.semanticOwners.push({ id: "other", lifecycle: "current" });
  changed.concepts[0].owner = "other";
  const diff = diffSemanticModels(model, changed);
  assert.deepEqual(
    diff.find((entry) => entry.collection === "concepts" && entry.id === "repository"),
    {
      type: "changed",
      collection: "concepts",
      id: "repository",
      breaking: true,
      classification: "ownership-change",
      properties: ["owner"],
    },
  );
});

test("semantic diff treats locator route changes as breaking", () => {
  const { model } = fixture();
  model.locators = [
    {
      id: "repository-url",
      concept: "repository",
      status: "active",
      fields: ["owner", "name"],
      scope: "fixture",
      routeFiles: ["apps/web/src/app/(resource)/[owner]/[name]/page.tsx"],
    },
  ];
  const changed = structuredClone(model);
  changed.locators[0].routeFiles = ["apps/web/src/app/(resource)/[owner]/[repo]/page.tsx"];
  assert.deepEqual(
    diffSemanticModels(model, changed).find(
      (entry) => entry.collection === "locators" && entry.id === "repository-url",
    ),
    {
      type: "changed",
      collection: "locators",
      id: "repository-url",
      breaking: true,
      classification: "locator-change",
      properties: ["routeFiles"],
    },
  );
});

test("semantic diff preserves benchmark decision identity across item kinds", () => {
  const before = {
    benchmarkDecisions: [
      { kind: "node", id: "shared", status: "deferred", reason: "Pending owner decision." },
      { kind: "projection", id: "shared", status: "deferred", reason: "Pending consumer." },
    ],
  };
  const after = structuredClone(before);
  after.benchmarkDecisions[0].status = "not-applicable";
  after.benchmarkDecisions.pop();
  const changes = diffSemanticModels(before, after);
  assert.deepEqual(
    changes.map(({ id, type }) => ({ id, type })),
    [
      { id: "node:shared", type: "changed" },
      { id: "projection:shared", type: "removed" },
    ],
  );
  assert.deepEqual(diffSemanticModels(before, structuredClone(before)), []);
});

test("semantic diff flags aggregate and adopted mapping changes as breaking", () => {
  const before = {
    capabilities: [
      {
        id: "repository-family",
        kind: "aggregate",
        members: ["read", "write"],
        preserves: ["K1", "K2"],
        validationProfiles: ["tests", "architecture"],
      },
    ],
    benchmarkDecisions: [{ kind: "node", id: "work", status: "adopted", capabilities: ["write"] }],
  };
  for (const property of ["members", "preserves", "validationProfiles"]) {
    const after = structuredClone(before);
    after.capabilities[0][property].pop();
    const changes = diffSemanticModels(before, after);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].breaking, true, property);
  }
  const remapped = structuredClone(before);
  remapped.benchmarkDecisions[0].capabilities = ["read"];
  assert.equal(diffSemanticModels(before, remapped)[0].breaking, true);
  assert.deepEqual(diffSemanticModels(before, structuredClone(before)), []);
});

test("validation profiles resolve the canonical package command surface", () => {
  const { model, benchmark, topology } = fixture();
  assert.deepEqual(
    validateSemanticArchitecture(model, benchmark, topology, {
      scripts: { semantic: "node semantic-cli.mjs" },
    }),
    [],
  );
  assert.match(
    validateSemanticArchitecture(model, benchmark, topology, { scripts: {} }).join("\n"),
    /unknown package.json command pnpm semantic check/,
  );
});

test("semantic planner resolves intent into owners, contracts and bounded change surfaces", () => {
  const { model, benchmark, topology } = fixture();
  const compiled = compileSemanticArchitecture(model, benchmark, topology);
  const plan = planSemanticChange(compiled, "Change Repository Project relationship");
  assert.deepEqual(plan.primaryOwners.sort(), ["project", "repository"]);
  assert.equal(plan.contracts[0].id, "project-repository");
  assert.equal(
    plan.candidateChangeSurfaces.some((surface) => surface.owner === "repository"),
    true,
  );
});

test("semantic planner keeps owner capability coverage after leaf split", () => {
  const { model, benchmark, topology } = fixture();
  model.evidenceModel.validationProfiles.push({
    id: "tests",
    command: "pnpm test",
    evidenceClass: "runtime",
    proves: ["fixture test evidence"],
  });
  model.capabilities.push({
    id: "manage-repository-stars",
    owner: "repository",
    kind: "leaf",
    runtimeExpectation: "required",
    intent: "Manage Repository stars.",
    preserves: ["K1"],
    validationProfiles: ["tests"],
    implementation: {
      status: "implemented",
      scope: "fixture",
      sourcePaths: ["packages/repository/src/application/stars.ts"],
      publicExports: ["./application/stars"],
      entrypoints: [],
      testPaths: [],
      note: "fixture",
    },
  });
  const plan = planSemanticChange(
    compileSemanticArchitecture(model, benchmark, topology),
    "Repository stars",
  );
  assert.equal(
    plan.capabilities.some((capability) => capability.id === "manage-repository"),
    true,
  );
  assert.equal(
    plan.capabilities.some((capability) => capability.id === "manage-repository-stars"),
    true,
  );
  assert.equal(
    plan.requiredValidation.some((profile) => profile.id === "tests"),
    true,
  );
});

test("agent context is a derived task slice, not a second semantic authority", () => {
  const { model, benchmark, topology } = fixture();
  const compiled = compileSemanticArchitecture(model, benchmark, topology);
  const context = compileAgentContext(compiled, "Repository");
  assert.equal(
    context.owners.some((owner) => owner.id === "repository"),
    true,
  );
  assert.equal(
    context.files.some((file) => file.owner === "repository"),
    true,
  );
  assert.equal(context.evidenceRule, null);
});

test("benchmark drift flags removal of an adopted concept for review", () => {
  const { model, benchmark } = fixture();
  const next = structuredClone(benchmark);
  next.nodes = [];
  const drift = diffSemanticBenchmark(benchmark, next, model);
  assert.deepEqual(drift.reviewRequired, [
    { type: "adopted-node-removed", id: "repository", breaking: true },
  ]);
});

test("query surface exposes contracts and boundaries from canonical semantic data", () => {
  const { model, benchmark, topology } = fixture();
  const compiled = compileSemanticArchitecture(model, benchmark, topology);
  assert.equal(
    querySemanticArchitecture(compiled, "contracts", ["repository"])[0].id,
    "project-repository",
  );
  assert.equal(
    Array.isArray(querySemanticArchitecture(compiled, "boundaries", ["repository"]).module),
    true,
  );
});

test("filesystem guard rejects fake source, public export and route evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "semantic-fs-"));
  const { model, benchmark, topology } = fixture();
  model.locators = [
    {
      id: "repository-route",
      concept: "repository",
      status: "active",
      fields: ["owner", "name"],
      scope: "fixture",
      routeFiles: ["apps/web/src/not-app/[owner]/[name]/page.tsx"],
    },
  ];
  model.capabilities[0].implementation.sourcePaths = ["packages/repository/src/application"];
  model.capabilities[0].implementation.publicExports = ["./application/missing"];

  await mkdir(join(root, "packages/repository/src/application"), { recursive: true });
  await writeFile(
    join(root, "packages/repository/package.json"),
    JSON.stringify({ exports: { "./application/issues": "./dist/application/issues.js" } }),
  );
  const compiled = compileSemanticArchitecture(model, benchmark, topology);
  const errors = await validateSemanticFilesystem(compiled, root);
  assert.match(errors.join("\n"), /missing sourcePath packages\/repository\/src\/application/);
  assert.match(errors.join("\n"), /unknown public export \.\/application\/missing/);
  assert.match(errors.join("\n"), /routeFile must be an app page\.tsx/);

  model.capabilities[0].implementation.sourcePaths = [
    "packages/repository/src/application/issues.ts",
  ];
  model.capabilities[0].implementation.publicExports = ["./application/issues"];
  model.locators[0].routeFiles = ["apps/web/src/app/(resource)/[owner]/[name]/page.tsx"];
  await writeFile(join(root, "packages/repository/src/application/issues.ts"), "export {};\n");
  await mkdir(join(root, "apps/web/src/app/(resource)/[owner]/[name]"), { recursive: true });
  await writeFile(
    join(root, "apps/web/src/app/(resource)/[owner]/[name]/page.tsx"),
    "export {};\n",
  );
  assert.deepEqual(
    await validateSemanticFilesystem(compileSemanticArchitecture(model, benchmark, topology), root),
    [],
  );
});

test("locator view derives URLs from route files without storing a second pattern", () => {
  assert.equal(
    routeFileToUrl("apps/web/src/app/(resource)/[login]/[repository]/page.tsx"),
    "/{login}/{repository}",
  );
  const { model, benchmark, topology } = fixture();
  model.locators = [
    {
      id: "repository-route",
      concept: "repository",
      status: "active",
      fields: ["owner", "name"],
      scope: "fixture",
      routeFiles: ["apps/web/src/app/(resource)/[login]/[repository]/page.tsx"],
    },
  ];
  const view = renderSemanticView(
    compileSemanticArchitecture(model, benchmark, topology),
    "locators",
  );
  assert.match(view, /\/\{login\}\/\{repository\}/);
});

test("runtime feedback detects drift without mutating semantic authority", () => {
  const { model, benchmark, topology } = fixture();
  const compiled = compileSemanticArchitecture(model, benchmark, topology);
  const feedback = compareSemanticFeedback(compiled, {
    version: 1,
    observedAt: "2026-09-24T00:00:00Z",
    channel: "runtime",
    source: "runtime-probe:repository",
    claims: [
      {
        capability: "manage-repository",
        status: "fail",
        evidenceRef: "probe://repository/manage",
      },
    ],
  });
  assert.equal(feedback.status, "drift");
  assert.equal(feedback.revisionProposal.derived, true);
  assert.equal(feedback.revisionProposal.autoApply, false);
  assert.equal(feedback.revisionProposal.candidates[0].owner, "repository");
});

test("observed target capability produces review, never automatic activation", () => {
  const { model, benchmark, topology } = fixture();
  const compiled = compileSemanticArchitecture(model, benchmark, topology);
  const feedback = compareSemanticFeedback(compiled, {
    version: 1,
    observedAt: "2026-09-24T00:00:00Z",
    channel: "runtime",
    source: "runtime-probe:project",
    claims: [
      {
        capability: "manage-project-planning",
        status: "pass",
        evidenceRef: "probe://project/planning",
      },
    ],
  });
  assert.equal(feedback.status, "review");
  assert.equal(feedback.revisionProposal.autoApply, false);
});

test("semantic plan derives authoritative and cross-context data surfaces from data topology", () => {
  const { model, benchmark, topology } = fixture();
  const dataTopology = {
    version: 2,
    role: "relation-data-topology",
    files: [
      { path: "supabase/schemas/600_repositories.sql", role: "authoritative" },
      { path: "supabase/schemas/900_cross_owner_projections.sql", role: "derived-projection" },
    ],
    relations: [
      {
        name: "repositories",
        kind: "table",
        path: "supabase/schemas/600_repositories.sql",
        authority: true,
        semanticOwner: "repository",
      },
      {
        name: "repository_access_view",
        kind: "view",
        path: "supabase/schemas/900_cross_owner_projections.sql",
        authority: false,
        role: "derived-projection",
        participants: ["repository", "project"],
      },
    ],
  };
  const schemaFiles = [
    "supabase/schemas/600_repositories.sql",
    "supabase/schemas/900_cross_owner_projections.sql",
  ];
  const relationsByFile = new Map([
    ["supabase/schemas/600_repositories.sql", [{ name: "repositories", kind: "table" }]],
    [
      "supabase/schemas/900_cross_owner_projections.sql",
      [{ name: "repository_access_view", kind: "view" }],
    ],
  ]);
  const compiled = compileSemanticArchitecture(
    model,
    benchmark,
    topology,
    null,
    dataTopology,
    schemaFiles,
    relationsByFile,
  );
  const plan = planSemanticChange(compiled, "Repository");
  const repository = plan.candidateChangeSurfaces.find((surface) => surface.owner === "repository");
  assert.deepEqual(
    repository.data.map((surface) => [surface.path, surface.relation, surface.role]),
    [
      ["supabase/schemas/600_repositories.sql", "repositories", "owner"],
      ["supabase/schemas/900_cross_owner_projections.sql", "repository_access_view", "participant"],
    ],
  );
  assert.deepEqual(
    plan.affectedBoundaries.data.map((surface) => surface.path),
    ["supabase/schemas/600_repositories.sql", "supabase/schemas/900_cross_owner_projections.sql"],
  );
});
