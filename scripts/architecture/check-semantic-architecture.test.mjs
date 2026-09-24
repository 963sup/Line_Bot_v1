import assert from "node:assert/strict";
import test from "node:test";
import { compileSemanticArchitecture, validateSemanticArchitecture } from "./semantic-core.mjs";
import { diffSemanticModels } from "./semantic-diff.mjs";
import { diffSemanticBenchmark } from "./semantic-drift.mjs";
import { compareSemanticFeedback } from "./semantic-feedback.mjs";
import { compileAgentContext, planSemanticChange } from "./semantic-planning.mjs";
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
        benchmark: { node: "repository" },
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
        runtimeExpectation: "required",
        preserves: ["K1"],
        validationProfiles: ["semantic-architecture"],
      },
      {
        id: "manage-project-planning",
        owner: "project",
        runtimeExpectation: "not-asserted",
        preserves: ["K1"],
        validationProfiles: ["semantic-architecture"],
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
