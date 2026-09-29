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
import { indexFptDocuments } from "./fpt-domain-core.mjs";
import { diffFptDomainTruth } from "./semantic-drift.mjs";
import { compareSemanticFeedback } from "./semantic-feedback.mjs";
import { compileAgentContext, planSemanticChange } from "./semantic-planning.mjs";
import { renderSemanticView, routeFileToUrl } from "./semantic-projection.mjs";
import { querySemanticArchitecture } from "./semantic-query.mjs";

function fixture() {
  const fptFiles = {
    "schema-repos.json": {
      queries: [],
      mutations: [],
      objects: [{ name: "Repository", fields: [{ name: "name", type: "String!" }], category: "repos" }],
      interfaces: [],
      enums: [],
      unions: [],
      inputObjects: [],
    },
    "schema-projects.json": {
      queries: [],
      mutations: [],
      objects: [{ name: "ProjectV2", fields: [{ name: "number", type: "Int!" }], category: "projects" }],
      interfaces: [],
      enums: [],
      unions: [],
      inputObjects: [],
    },
  };
  const fpt = {
    manifest: {
      version: 1,
      role: "github-fpt-domain-truth-provenance",
      upstream: {
        repository: "github/docs",
        revision: "0123456789abcdef0123456789abcdef01234567",
        path: "src/graphql/data/fpt",
      },
      files: [
        { name: "schema-projects.json", gitBlobSha: "1111111111111111111111111111111111111111" },
        { name: "schema-repos.json", gitBlobSha: "2222222222222222222222222222222222222222" },
      ],
    },
    files: fptFiles,
    symbols: indexFptDocuments(fptFiles),
  };
  const topology = {
    version: 2,
    role: "implementation-topology",
    semanticModel: "architecture/semantic-model.json",
    modules: {
      "@line_bot_v1/repository": {
        path: "packages/repository",
        moduleKind: "domain-module",
        semanticOwner: "repository",
        allowedWorkspaceDependencies: [],
      },
    },
    applications: {},
  };
  const model = {
    version: 2,
    role: "product-domain-overlay",
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
        fpt: { file: "schema-repos.json", category: "repos", symbol: "Repository" },
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
        kind: "fpt-reference-must-resolve",
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
      { semanticOwner: "repository", module: "@line_bot_v1/repository" },
      { semanticOwner: "project", module: null },
    ],
  };
  return { model, fpt, topology };
}

test("accepts separated semantic, implementation and fpt authority", () => {
  const { model, fpt, topology } = fixture();
  assert.deepEqual(validateSemanticArchitecture(model, fpt, topology), []);
});

test("rejects required runtime capability without implemented source and export evidence", () => {
  const { model, fpt, topology } = fixture();
  model.capabilities[0].implementation.sourcePaths = [];
  assert.match(
    validateSemanticArchitecture(model, fpt, topology).join("\n"),
    /required runtime expectation needs implemented sourcePaths and publicExports evidence/,
  );
});

test("rejects aggregate capabilities with cross-owner or non-leaf members", () => {
  const { model, fpt, topology } = fixture();
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
    validateSemanticArchitecture(model, fpt, topology).join("\n"),
    /has different owner/,
  );
});

test("FPT may contain unused GitHub symbols without a second adoption ledger", () => {
  const { model, fpt, topology } = fixture();
  fpt.files["schema-repos.json"].objects.push({
    name: "RepositoryInvitation",
    fields: [],
    category: "repos",
  });
  fpt.symbols = indexFptDocuments(fpt.files);
  assert.deepEqual(validateSemanticArchitecture(model, fpt, topology), []);
});

test("rejects active locators for data-only or target concepts", () => {
  const { model, fpt, topology } = fixture();
  model.locators = [
    {
      id: "project-url",
      concept: "project",
      status: "active",
      fields: ["number"],
      scope: "fixture",
      scopeAuthority: "repository",
      routeFiles: ["apps/web/src/app/(mobile)/projects/[number]/page.tsx"],
      fpt: { file: "schema-projects.json", category: "projects", symbol: "ProjectV2" },
    },
  ];
  assert.match(
    validateSemanticArchitecture(model, fpt, topology).join("\n"),
    /inactive concept lifecycle cannot claim active locator/,
  );
});

test("rejects active current locators without route evidence", () => {
  const { model, fpt, topology } = fixture();
  model.locators = [
    {
      id: "repository-url",
      concept: "repository",
      status: "active",
      fields: ["owner", "name"],
      scope: "fixture",
      scopeAuthority: "repository",
      routeFiles: [],
    },
  ];
  assert.match(
    validateSemanticArchitecture(model, fpt, topology).join("\n"),
    /active locator requires routeFiles/,
  );
});

test("locator scopes require an explicit semantic authority", () => {
  const { model, fpt, topology } = fixture();
  model.locators = [
    {
      id: "repository-url",
      concept: "repository",
      status: "active",
      fields: ["owner", "name"],
      scope: "repository-owner-name",
      routeFiles: ["apps/web/src/app/(resource)/[owner]/[name]/page.tsx"],
    },
  ];
  assert.match(
    validateSemanticArchitecture(model, fpt, topology).join("\n"),
    /scopeAuthority is required/,
  );
  model.locators[0].scopeAuthority = "missing";
  assert.match(
    validateSemanticArchitecture(model, fpt, topology).join("\n"),
    /unknown scopeAuthority missing/,
  );
});

test("all locators in one namespace scope must agree on authority", () => {
  const { model, fpt, topology } = fixture();
  model.locators = [
    {
      id: "repository-url",
      concept: "repository",
      status: "active",
      fields: ["owner", "name"],
      scope: "shared-scope",
      scopeAuthority: "repository",
      routeFiles: ["apps/web/src/app/(resource)/[owner]/[name]/page.tsx"],
    },
    {
      id: "project-url",
      concept: "project",
      status: "reference-only",
      fields: ["number"],
      scope: "shared-scope",
      scopeAuthority: "project",
      routeFiles: [],
    },
  ];
  assert.match(
    validateSemanticArchitecture(model, fpt, topology).join("\n"),
    /conflicting authorities repository and project/,
  );
});

test("rejects lifecycle typos before lifecycle-dependent guards run", () => {
  const { model, fpt, topology } = fixture();
  model.semanticOwners[0].lifecycle = "selected-targte";
  model.concepts[0].lifecycle = "current-dtaa-only";
  assert.match(
    validateSemanticArchitecture(model, fpt, topology).join("\n"),
    /unsupported lifecycle/,
  );
});

test("rejects unresolved direct FPT concept references", () => {
  const { model, fpt, topology } = fixture();
  model.concepts[0].fpt.symbol = "MissingRepository";
  assert.match(
    validateSemanticArchitecture(model, fpt, topology).join("\n"),
    /unresolved FPT reference/,
  );
});

test("rejects and repairs mixed leaf and aggregate evidence shapes", () => {
  const { model, fpt, topology } = fixture();
  const leaf = model.capabilities[0];
  leaf.members = [model.capabilities[1].id];
  assert.match(
    validateSemanticArchitecture(model, fpt, topology).join("\n"),
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
    validateSemanticArchitecture(model, fpt, topology).join("\n"),
    /aggregate must not declare leaf implementation/,
  );
  delete aggregate.implementation;
  assert.deepEqual(validateSemanticArchitecture(model, fpt, topology), []);
});

test("rejects a module pretending to be a bounded context", () => {
  const { model, fpt, topology } = fixture();
  topology.modules["@line_bot_v1/repository"].moduleKind = "bounded-context";
  assert.match(
    validateSemanticArchitecture(model, fpt, topology).join("\n"),
    /must not masquerade/,
  );
});

test("rejects unresolved direct FPT locator fields", () => {
  const { model, fpt, topology } = fixture();
  model.locators = [
    {
      id: "repository-url",
      concept: "repository",
      status: "reference-only",
      fields: ["name"],
      scope: "fixture",
      scopeAuthority: "repository",
      routeFiles: [],
      fpt: { file: "schema-repos.json", category: "repos", symbol: "Repository", field: "missing" },
    },
  ];
  assert.match(
    validateSemanticArchitecture(model, fpt, topology).join("\n"),
    /unresolved FPT reference/,
  );
});

test("cross-owner workspace dependencies require an explicit semantic relationship contract", () => {
  const { model, fpt, topology } = fixture();
  topology.modules["@line_bot_v1/project"] = {
    path: "packages/project",
    moduleKind: "domain-module",
    semanticOwner: "project",
    allowedWorkspaceDependencies: [],
  };
  topology.modules["@line_bot_v1/repository"].allowedWorkspaceDependencies = [
    "@line_bot_v1/project",
  ];
  model.implementationMappings.find((mapping) => mapping.semanticOwner === "project").module =
    "@line_bot_v1/project";

  assert.deepEqual(validateSemanticArchitecture(model, fpt, topology), []);

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
    validateSemanticArchitecture(model, fpt, topology).join("\n"),
    /cross-owner dependency @line_bot_v1\/project .* lacks explicit semantic relationship contract/,
  );
});

test("rejects topology semantic owners that do not resolve", () => {
  const { model, fpt, topology } = fixture();
  topology.modules["@line_bot_v1/repository"].semanticOwner = "missing";
  assert.match(
    validateSemanticArchitecture(model, fpt, topology).join("\n"),
    /semanticOwner must resolve/,
  );
});

test("query path and impact are derived from compiled relationships", () => {
  const { model, fpt, topology } = fixture();
  const compiled = compileSemanticArchitecture(model, fpt, topology);
  assert.deepEqual(querySemanticArchitecture(compiled, "path", ["repository", "project"]), [
    "repository",
    "project",
  ]);
  const impact = querySemanticArchitecture(compiled, "impact", ["repository"]);
  assert.equal(impact.owner.id, "repository");
  assert.deepEqual(impact.direct, [{ owner: "project", path: ["repository", "project"] }]);
  assert.equal(impact.implementation.module, "@line_bot_v1/repository");
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
      scopeAuthority: "repository",
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

test("semantic diff treats direct FPT reference changes as breaking", () => {
  const before = {
    concepts: [
      {
        id: "repository",
        fpt: { file: "schema-repos.json", category: "repos", symbol: "Repository" },
      },
    ],
  };
  const after = structuredClone(before);
  after.concepts[0].fpt.symbol = "RepositoryInvitation";
  assert.deepEqual(diffSemanticModels(before, after), [
    {
      type: "changed",
      collection: "concepts",
      id: "repository",
      breaking: true,
      classification: "domain-reference-change",
      properties: ["fpt"],
    },
  ]);
  assert.deepEqual(diffSemanticModels(before, structuredClone(before)), []);
});

test("semantic diff flags aggregate and FPT mapping changes as breaking", () => {
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
    concepts: [
      {
        id: "repository",
        fpt: { file: "schema-repos.json", category: "repos", symbol: "Repository" },
      },
    ],
  };
  for (const property of ["members", "preserves", "validationProfiles"]) {
    const after = structuredClone(before);
    after.capabilities[0][property].pop();
    const changes = diffSemanticModels(before, after);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].breaking, true, property);
  }
  const remapped = structuredClone(before);
  remapped.concepts[0].fpt.symbol = "RepositoryInvitation";
  assert.equal(diffSemanticModels(before, remapped)[0].breaking, true);
  assert.deepEqual(diffSemanticModels(before, structuredClone(before)), []);
});

test("validation profiles resolve the canonical package command surface", () => {
  const { model, fpt, topology } = fixture();
  assert.deepEqual(
    validateSemanticArchitecture(model, fpt, topology, {
      scripts: { semantic: "node semantic-cli.mjs" },
    }),
    [],
  );
  assert.match(
    validateSemanticArchitecture(model, fpt, topology, { scripts: {} }).join("\n"),
    /unknown package.json command pnpm semantic check/,
  );
});

test("semantic planner resolves intent into owners, contracts and bounded change surfaces", () => {
  const { model, fpt, topology } = fixture();
  const compiled = compileSemanticArchitecture(model, fpt, topology);
  const plan = planSemanticChange(compiled, "Change Repository Project relationship");
  assert.deepEqual(plan.primaryOwners.sort(), ["project", "repository"]);
  assert.equal(plan.contracts[0].id, "project-repository");
  assert.equal(
    plan.candidateChangeSurfaces.some((surface) => surface.owner === "repository"),
    true,
  );
});

test("semantic planner keeps owner capability coverage after leaf split", () => {
  const { model, fpt, topology } = fixture();
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
    compileSemanticArchitecture(model, fpt, topology),
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
  const { model, fpt, topology } = fixture();
  const compiled = compileSemanticArchitecture(model, fpt, topology);
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

test("FPT drift flags removal of a referenced truth file for review", () => {
  const { model, fpt } = fixture();
  const before = structuredClone(fpt.manifest);
  const next = structuredClone(before);
  next.files = next.files.filter((entry) => entry.name !== "schema-repos.json");
  const drift = diffFptDomainTruth(before, next, model);
  assert.deepEqual(
    drift.reviewRequired.find((entry) => entry.id === "schema-repos.json"),
    { type: "fpt-file-removed", id: "schema-repos.json", breaking: true },
  );
});

test("query surface exposes contracts and boundaries from canonical semantic data", () => {
  const { model, fpt, topology } = fixture();
  const compiled = compileSemanticArchitecture(model, fpt, topology);
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
  const { model, fpt, topology } = fixture();
  model.locators = [
    {
      id: "repository-route",
      concept: "repository",
      status: "active",
      fields: ["owner", "name"],
      scope: "fixture",
      scopeAuthority: "repository",
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
  const compiled = compileSemanticArchitecture(model, fpt, topology);
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
    await validateSemanticFilesystem(compileSemanticArchitecture(model, fpt, topology), root),
    [],
  );
});

test("locator view derives URLs from route files without storing a second pattern", () => {
  assert.equal(
    routeFileToUrl("apps/web/src/app/(resource)/[login]/[repository]/page.tsx"),
    "/{login}/{repository}",
  );
  const { model, fpt, topology } = fixture();
  model.locators = [
    {
      id: "repository-route",
      concept: "repository",
      status: "active",
      fields: ["owner", "name"],
      scope: "fixture",
      scopeAuthority: "repository",
      routeFiles: ["apps/web/src/app/(resource)/[login]/[repository]/page.tsx"],
    },
  ];
  const view = renderSemanticView(
    compileSemanticArchitecture(model, fpt, topology),
    "locators",
  );
  assert.match(view, /\/\{login\}\/\{repository\}/);
});

test("runtime feedback detects drift without mutating semantic authority", () => {
  const { model, fpt, topology } = fixture();
  const compiled = compileSemanticArchitecture(model, fpt, topology);
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
  const { model, fpt, topology } = fixture();
  const compiled = compileSemanticArchitecture(model, fpt, topology);
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
  const { model, fpt, topology } = fixture();
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
    fpt,
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
