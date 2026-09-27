import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { validateSemanticBenchmark } from "./check-semantic-benchmark.mjs";
import { diffSemanticBenchmark } from "./semantic-drift.mjs";

function sourceInventoryGitTreeSha(entries) {
  const treeEntries = entries
    .map((entry) => ({ file: entry.file, gitBlobSha: entry.gitBlobSha }))
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left.file, "utf8"), Buffer.from(right.file, "utf8")),
    );
  const body = Buffer.concat(
    treeEntries.flatMap((entry) => [
      Buffer.from(`100644 ${entry.file}\0`, "utf8"),
      Buffer.from(entry.gitBlobSha, "hex"),
    ]),
  );
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`tree ${body.length}\0`, "utf8"), body]))
    .digest("hex");
}

function schemaEntry(category, disposition = "included") {
  return {
    file: `schema-${category}.json`,
    gitBlobSha: "0123456789abcdef0123456789abcdef01234567",
    role: "schema-fragment",
    category,
    disposition,
    reason: `${category} scope decision`,
  };
}

function nonSchemaEntry(file, role) {
  return {
    file,
    gitBlobSha: "abcdef0123456789abcdef0123456789abcdef01",
    role,
    reason: `${role} output family`,
  };
}

function attachInventory(graph) {
  graph.sourceInventory = [
    schemaEntry("users"),
    schemaEntry("enterprise-admin"),
    schemaEntry("orgs"),
    schemaEntry("teams"),
    schemaEntry("repos"),
    schemaEntry("projects"),
    schemaEntry("issues"),
    schemaEntry("discussions"),
    schemaEntry("reactions"),
    schemaEntry("activity"),
    schemaEntry("meta", "reference-only"),
    schemaEntry("search", "reference-only"),
    schemaEntry("actions", "excluded"),
    schemaEntry("branches", "excluded"),
    schemaEntry("checks", "excluded"),
    schemaEntry("code-scanning", "excluded"),
    schemaEntry("code-security", "excluded"),
    schemaEntry("codespaces", "excluded"),
    schemaEntry("commits", "excluded"),
    schemaEntry("dependabot", "excluded"),
    schemaEntry("dependency-graph", "excluded"),
    schemaEntry("deploy-keys", "excluded"),
    schemaEntry("deployments", "excluded"),
    schemaEntry("git", "excluded"),
    schemaEntry("packages", "excluded"),
    schemaEntry("pages", "excluded"),
    schemaEntry("pulls", "excluded"),
    schemaEntry("releases", "excluded"),
    schemaEntry("secret-scanning", "excluded"),
    schemaEntry("security-advisories", "excluded"),
    nonSchemaEntry("category-map.json", "category-index"),
    nonSchemaEntry("schema.docs.graphql", "rendered-schema"),
    nonSchemaEntry("previews.json", "preview"),
    nonSchemaEntry("upcoming-changes.json", "future-change"),
    nonSchemaEntry("changelog.json", "history"),
  ];
  graph.sourceInventoryMetadata = {
    gitTreeSha: sourceInventoryGitTreeSha(graph.sourceInventory),
    source: "test fixture",
  };
  graph.sourcePipeline = [
    {
      id: "sync-source",
      meaning: "sync",
      source: {
        repository: "github/docs",
        revision: graph.authority.revision,
        path: "src/graphql/scripts/sync.ts",
      },
      outputFamilies: [
        "schema-fragment",
        "category-index",
        "future-change",
        "preview",
        "rendered-schema",
        "history",
      ],
    },
  ];
}

function validGraph() {
  const source = (file, category, symbol) => ({ file, category, symbol });
  const nodes = [
    ["user", "actor", source("schema-users.json", "users", "User")],
    [
      "enterprise",
      "governance-scope",
      source("schema-enterprise-admin.json", "enterprise-admin", "Enterprise"),
    ],
    ["organization", "governance-scope", source("schema-orgs.json", "orgs", "Organization")],
    ["organization-team", "group", source("schema-teams.json", "teams", "Team")],
    ["repository", "container", source("schema-repos.json", "repos", "Repository")],
    ["project", "planning", source("schema-projects.json", "projects", "ProjectV2")],
    ["work-item", "work", source("schema-issues.json", "issues", "Issue")],
    ["discussion", "collaboration", source("schema-discussions.json", "discussions", "Discussion")],
  ].map(([id, kind, nodeSource]) => ({ id, kind, meaning: id, source: nodeSource }));

  const graph = {
    version: 2,
    role: "derived-general-management-semantic-benchmark",
    contract: {
      authorityMode: "external-benchmark-only",
      productAuthority: false,
      productAdoption: "explicit-mapping-required",
      relationshipCardinality: "read-from-pinned-upstream-source",
      derivedStructures: "must-remain-derived",
      currentState: "pinned-revision",
    },
    authority: {
      repository: "github/docs",
      revision: "03d2e24b34bd88c361f1185f0aae1c46062c6510",
      path: "src/graphql/data/fpt",
    },
    scope: {
      purpose: "test graph",
    },
    nodes,
    edges: [
      {
        from: "organization",
        type: "contains",
        to: "organization-team",
        source: {
          file: "schema-orgs.json",
          category: "orgs",
          symbol: "Organization",
          field: "teams",
        },
      },
    ],
  };
  attachInventory(graph);
  return graph;
}

test("accepts the minimum management graph", () => {
  assert.deepEqual(validateSemanticBenchmark(validGraph()), []);
});

test("rejects software-development categories as included inventory", () => {
  const graph = validGraph();
  const git = graph.sourceInventory.find((entry) => entry.category === "git");
  git.disposition = "included";
  graph.sourceInventoryMetadata.gitTreeSha = sourceInventoryGitTreeSha(graph.sourceInventory);
  assert.match(validateSemanticBenchmark(graph).join("\n"), /must stay excluded: git/);
});

test("rejects and repairs missing source inventory coverage", () => {
  const graph = validGraph();
  graph.sourceInventory = graph.sourceInventory.filter(
    (entry) => entry.file !== "schema-users.json",
  );
  graph.sourceInventoryMetadata.gitTreeSha = sourceInventoryGitTreeSha(graph.sourceInventory);

  assert.match(
    validateSemanticBenchmark(graph).join("\n"),
    /node user cites a file outside sourceInventory/,
  );

  graph.sourceInventory.unshift(schemaEntry("users"));
  graph.sourceInventoryMetadata.gitTreeSha = sourceInventoryGitTreeSha(graph.sourceInventory);
  assert.deepEqual(validateSemanticBenchmark(graph), []);
});

test("rejects and repairs missing forbidden inventory even with a recomputed tree", () => {
  const graph = validGraph();
  graph.sourceInventory = graph.sourceInventory.filter((entry) => entry.file !== "schema-git.json");
  graph.sourceInventoryMetadata.entryCount = graph.sourceInventory.length;
  graph.sourceInventoryMetadata.inventoryHash = "legacy-self-hash-is-not-authority";

  assert.match(
    validateSemanticBenchmark(graph).join("\n"),
    /sourceInventoryMetadata\.gitTreeSha does not match inventory/,
  );
  assert.match(
    validateSemanticBenchmark(graph).join("\n"),
    /SCM\/software category is missing from inventory: git/,
  );

  graph.sourceInventory.push(schemaEntry("git", "excluded"));
  graph.sourceInventoryMetadata.gitTreeSha = sourceInventoryGitTreeSha(graph.sourceInventory);
  assert.deepEqual(validateSemanticBenchmark(graph), []);
});

test("rejects stale source inventory tree metadata", () => {
  const graph = validGraph();
  graph.sourceInventoryMetadata.gitTreeSha = "0000000000000000000000000000000000000000";

  assert.match(
    validateSemanticBenchmark(graph).join("\n"),
    /sourceInventoryMetadata\.gitTreeSha does not match inventory/,
  );

  graph.sourceInventoryMetadata.gitTreeSha = sourceInventoryGitTreeSha(graph.sourceInventory);
  assert.deepEqual(validateSemanticBenchmark(graph), []);
});

test("rejects duplicate source inventory files", () => {
  const graph = validGraph();
  graph.sourceInventory.push({ ...graph.sourceInventory[0] });
  graph.sourceInventoryMetadata.gitTreeSha = sourceInventoryGitTreeSha(graph.sourceInventory);

  assert.match(
    validateSemanticBenchmark(graph).join("\n"),
    /sourceInventory file must be unique: schema-users\.json/,
  );
});

test("rejects and repairs fixed output family role drift", () => {
  const graph = validGraph();
  const categoryMap = graph.sourceInventory.find((entry) => entry.file === "category-map.json");
  categoryMap.role = "preview";
  graph.sourceInventoryMetadata.gitTreeSha = sourceInventoryGitTreeSha(graph.sourceInventory);

  assert.match(
    validateSemanticBenchmark(graph).join("\n"),
    /category-map\.json must use output role category-index/,
  );

  categoryMap.role = "category-index";
  graph.sourceInventoryMetadata.gitTreeSha = sourceInventoryGitTreeSha(graph.sourceInventory);
  assert.deepEqual(validateSemanticBenchmark(graph), []);
});

test("rejects and repairs source pipeline family coverage drift", () => {
  const graph = validGraph();
  graph.sourcePipeline[0].outputFamilies = graph.sourcePipeline[0].outputFamilies.filter(
    (family) => family !== "rendered-schema",
  );

  assert.match(
    validateSemanticBenchmark(graph).join("\n"),
    /sourcePipeline does not cover inventory family: rendered-schema/,
  );

  graph.sourcePipeline[0].outputFamilies.push("rendered-schema");
  assert.deepEqual(validateSemanticBenchmark(graph), []);
});

test("rejects source inventory category drift", () => {
  const graph = validGraph();
  const users = graph.sourceInventory.find((entry) => entry.file === "schema-users.json");
  users.category = "orgs";
  graph.sourceInventoryMetadata.gitTreeSha = sourceInventoryGitTreeSha(graph.sourceInventory);

  assert.match(
    validateSemanticBenchmark(graph).join("\n"),
    /schema-users\.json category must match its schema file name/,
  );
});

test("rejects reference contracts backed only by excluded fragments", () => {
  const graph = validGraph();
  graph.referenceContracts = [
    {
      id: "git-identity",
      meaning: "bad reference",
      sources: [{ file: "schema-git.json", category: "git", symbol: "GitObject", field: "oid" }],
    },
  ];

  assert.match(
    validateSemanticBenchmark(graph).join("\n"),
    /reference contract git-identity uses excluded source category: git/,
  );

  graph.referenceContracts[0] = {
    id: "node-identity",
    meaning: "reference-only identity",
    sources: [{ file: "schema-meta.json", category: "meta", symbol: "Node", field: "id" }],
  };
  assert.deepEqual(validateSemanticBenchmark(graph), []);
});

test("drift reviews pipeline and adopted benchmark removals", () => {
  const before = validGraph();
  before.referenceContracts = [{ id: "node-identity", meaning: "identity", sources: [] }];
  before.projections = [{ id: "user-profile", ownerNode: "user", sources: [] }];
  before.derivedResults = [{ id: "achievement", subjectNode: "user" }];
  before.supplementalEvidence = [
    {
      kind: "canonical-docs",
      repository: "github/docs",
      revision: before.authority.revision,
      path: "content/account-and-profile/reference/profile-reference.md",
    },
  ];

  const after = structuredClone(before);
  after.referenceContracts = [];
  after.projections = [];
  after.derivedResults = [];
  after.sourcePipeline = [];
  after.supplementalEvidence = [];

  const diff = diffSemanticBenchmark(before, after, {
    concepts: [{ benchmark: { node: "user" } }],
    benchmarkDecisions: [
      { kind: "reference-contract", id: "node-identity", status: "adopted" },
      { kind: "projection", id: "user-profile", status: "adopted" },
      { kind: "derived-result", id: "achievement", status: "adopted" },
    ],
  });

  assert.deepEqual(diff.referenceContracts.removed, ["node-identity"]);
  assert.deepEqual(diff.projections.removed, ["user-profile"]);
  assert.deepEqual(diff.derivedResults.removed, ["achievement"]);
  assert.deepEqual(diff.sourcePipeline.removed, ["sync-source"]);
  assert.deepEqual(diff.supplementalEvidence.removed, [
    [
      "canonical-docs",
      "github/docs",
      before.authority.revision,
      "content/account-and-profile/reference/profile-reference.md",
    ].join("|"),
  ]);
  assert.equal(
    diff.reviewRequired.find((entry) => entry.type === "reference-contract-removed")?.breaking,
    true,
  );
  assert.equal(
    diff.reviewRequired.find((entry) => entry.type === "projection-removed")?.breaking,
    true,
  );
  assert.equal(
    diff.reviewRequired.find((entry) => entry.type === "derived-result-removed")?.breaking,
    true,
  );
  assert.equal(
    diff.reviewRequired.find((entry) => entry.type === "source-pipeline-removed")?.breaking,
    false,
  );
});

test("drift treats adopted decision nodes as breaking relationship endpoints", () => {
  const before = validGraph();
  before.nodes.push({
    id: "discussion-comment",
    kind: "collaboration-item",
    meaning: "comment",
    source: {
      file: "schema-discussions.json",
      category: "discussions",
      symbol: "DiscussionComment",
    },
  });
  before.edges.push({
    from: "discussion",
    type: "contains",
    to: "discussion-comment",
    source: {
      file: "schema-discussions.json",
      category: "discussions",
      symbol: "Discussion",
      field: "comments",
    },
  });

  const after = structuredClone(before);
  after.edges = after.edges.filter(
    (edge) =>
      !(edge.from === "discussion" && edge.type === "contains" && edge.to === "discussion-comment"),
  );

  const semanticModel = {
    concepts: [{ benchmark: { node: "discussion" } }],
    benchmarkDecisions: [{ kind: "node", id: "discussion-comment", status: "adopted" }],
  };
  const broken = diffSemanticBenchmark(before, after, semanticModel);

  assert.deepEqual(broken.adoptedNodes, ["discussion", "discussion-comment"]);
  assert.deepEqual(
    broken.reviewRequired.find((entry) => entry.type === "adopted-relationship-removed"),
    {
      type: "adopted-relationship-removed",
      id: "discussion|contains|discussion-comment|",
      breaking: true,
    },
  );

  after.edges = structuredClone(before.edges);
  const repaired = diffSemanticBenchmark(before, after, semanticModel);
  assert.equal(
    repaired.reviewRequired.some((entry) => entry.type === "adopted-relationship-removed"),
    false,
  );
});

test("rejects dangling edges", () => {
  const graph = validGraph();
  graph.edges[0].to = "missing";
  assert.match(validateSemanticBenchmark(graph).join("\n"), /edge target does not exist/);
});

test("accepts a repaired dangling edge", () => {
  const graph = validGraph();
  graph.edges[0].to = "missing";
  assert.match(validateSemanticBenchmark(graph).join("\n"), /edge target does not exist/);

  graph.edges[0].to = "organization-team";
  assert.deepEqual(validateSemanticBenchmark(graph), []);
});

test("models followers and following as one directed User relationship", () => {
  const graph = validGraph();
  graph.edges.push({
    from: "user",
    type: "follows",
    to: "user",
    source: {
      file: "schema-users.json",
      category: "users",
      symbol: "User",
      field: "following",
      inverseField: "followers",
    },
  });

  assert.deepEqual(validateSemanticBenchmark(graph), []);
  assert.equal(
    graph.nodes.some((node) => node.id === "followers"),
    false,
  );
  assert.equal(
    graph.nodes.some((node) => node.id === "following"),
    false,
  );
});

test("rejects implementation topology masquerading as semantic nodes", () => {
  const graph = validGraph();
  graph.nodes.push({
    id: "attendance-package",
    kind: "package",
    meaning: "implementation detail",
    source: { file: "schema-users.json", category: "users", symbol: "User" },
  });
  assert.match(
    validateSemanticBenchmark(graph).join("\n"),
    /implementation node kind is forbidden/,
  );
});

test("models profile and collections as projections instead of duplicate nodes", () => {
  const graph = validGraph();
  graph.edges.push(
    {
      from: "user",
      type: "follows",
      to: "user",
      source: { file: "schema-users.json", category: "users", symbol: "User", field: "following" },
    },
    {
      from: "repository",
      type: "owned-by",
      to: "user",
      source: {
        file: "schema-repos.json",
        category: "repos",
        symbol: "Repository",
        field: "owner",
      },
    },
  );
  graph.projections = [
    {
      id: "user-profile",
      kind: "read-projection",
      ownerNode: "user",
      sources: [{ file: "schema-users.json", category: "users", symbol: "ProfileOwner" }],
    },
    {
      id: "user-followers",
      kind: "relationship-view",
      ownerNode: "user",
      relationship: "user|follows|user",
      source: { file: "schema-users.json", category: "users", symbol: "User", field: "followers" },
    },
    {
      id: "user-repositories",
      kind: "relationship-view",
      ownerNode: "user",
      relationship: "repository|owned-by|user",
      source: {
        file: "schema-users.json",
        category: "users",
        symbol: "User",
        field: "repositories",
      },
    },
  ];

  assert.deepEqual(validateSemanticBenchmark(graph), []);
  assert.equal(
    graph.nodes.some((node) => node.id === "profile"),
    false,
  );
  assert.equal(
    graph.nodes.some((node) => node.id === "followers"),
    false,
  );
  assert.equal(
    graph.nodes.some((node) => node.id === "repositories"),
    false,
  );
});

test("keeps Achievement derived from observable FPT facts and canonical docs", () => {
  const graph = validGraph();
  graph.nodes.push(
    {
      id: "contribution",
      kind: "fact-contract",
      meaning: "contract",
      source: { file: "schema-users.json", category: "users", symbol: "Contribution" },
    },
    {
      id: "contributions-collection",
      kind: "fact-collection",
      meaning: "facts",
      source: { file: "schema-users.json", category: "users", symbol: "ContributionsCollection" },
    },
    {
      id: "repository-contribution",
      kind: "event-fact",
      meaning: "fact",
      temporalField: "occurredAt",
      implements: ["contribution"],
      source: {
        file: "schema-users.json",
        category: "users",
        symbol: "CreatedRepositoryContribution",
      },
    },
  );
  graph.edges.push(
    {
      from: "repository-contribution",
      type: "made-by",
      to: "user",
      source: {
        file: "schema-users.json",
        category: "users",
        symbol: "CreatedRepositoryContribution",
        field: "user",
      },
    },
    {
      from: "repository-contribution",
      type: "context",
      to: "repository",
      source: {
        file: "schema-users.json",
        category: "users",
        symbol: "CreatedRepositoryContribution",
        field: "repository",
      },
    },
  );
  graph.projections = [
    {
      id: "user-profile",
      kind: "read-projection",
      ownerNode: "user",
      sources: [{ file: "schema-users.json", category: "users", symbol: "ProfileOwner" }],
    },
  ];
  graph.supplementalEvidence = [
    {
      kind: "canonical-docs",
      repository: "github/docs",
      revision: graph.authority.revision,
      path: "content/account-and-profile/reference/profile-reference.md",
    },
  ];
  graph.derivedResults = [
    {
      id: "achievement",
      kind: "derived-recognition",
      subjectNode: "user",
      projection: "user-profile",
      source: {
        kind: "canonical-docs",
        repository: "github/docs",
        revision: graph.authority.revision,
        path: "content/account-and-profile/reference/profile-reference.md",
      },
      observableModel: {
        factContract: "contribution",
        factCollection: "contributions-collection",
        eventFacts: ["repository-contribution"],
        actorRelationships: ["repository-contribution|made-by|user"],
        contextRelationships: ["repository-contribution|context|repository"],
        timeFields: ["repository-contribution.occurredAt"],
      },
    },
  ];

  assert.deepEqual(validateSemanticBenchmark(graph), []);
  assert.equal(
    graph.nodes.some((node) => node.id === "achievement"),
    false,
  );
});

test("rejects and repairs derived-result revision/time drift", () => {
  const graph = validGraph();
  graph.nodes.push({
    id: "repository-contribution",
    kind: "event-fact",
    meaning: "fact",
    temporalField: "occurredAt",
    source: {
      file: "schema-users.json",
      category: "users",
      symbol: "CreatedRepositoryContribution",
    },
  });
  graph.projections = [
    {
      id: "user-profile",
      kind: "read-projection",
      ownerNode: "user",
      sources: [{ file: "schema-users.json", category: "users", symbol: "ProfileOwner" }],
    },
  ];
  graph.supplementalEvidence = [
    {
      kind: "canonical-docs",
      repository: "github/docs",
      revision: graph.authority.revision,
      path: "content/account-and-profile/reference/profile-reference.md",
    },
  ];
  graph.derivedResults = [
    {
      id: "achievement",
      kind: "derived-recognition",
      subjectNode: "user",
      projection: "user-profile",
      source: {
        kind: "canonical-docs",
        repository: "github/docs",
        revision: "0000000000000000000000000000000000000000",
        path: "content/account-and-profile/reference/profile-reference.md",
      },
      observableModel: {
        eventFacts: ["repository-contribution"],
        timeFields: ["repository-contribution.createdAt"],
      },
    },
  ];

  const broken = validateSemanticBenchmark(graph).join("\n");
  assert.match(broken, /canonical GitHub Docs/);
  assert.match(broken, /time field is not backed by an event fact/);

  graph.derivedResults[0].source.revision = graph.authority.revision;
  graph.derivedResults[0].observableModel.timeFields = ["repository-contribution.occurredAt"];
  assert.deepEqual(validateSemanticBenchmark(graph), []);
});

test("preserves relationship role and permission as edge attributes", () => {
  const graph = validGraph();
  graph.edges[0].attributes = [
    {
      name: "role",
      source: {
        file: "schema-users.json",
        category: "users",
        symbol: "OrganizationMemberEdge",
      },
    },
  ];

  assert.match(
    validateSemanticBenchmark(graph).join("\n"),
    /attribute role must cite upstream symbol \+ field evidence/,
  );

  graph.edges[0].attributes[0].source.field = "role";
  assert.deepEqual(validateSemanticBenchmark(graph), []);
});

test("rejects and repairs a missing fact contract", () => {
  const graph = validGraph();
  graph.nodes.push({
    id: "event",
    kind: "event-fact",
    meaning: "event",
    temporalField: "occurredAt",
    implements: ["contribution"],
    source: { file: "schema-users.json", category: "users", symbol: "CreatedIssueContribution" },
  });

  assert.match(
    validateSemanticBenchmark(graph).join("\n"),
    /implements missing contract: contribution/,
  );

  graph.nodes.push({
    id: "contribution",
    kind: "fact-contract",
    meaning: "contract",
    source: { file: "schema-users.json", category: "users", symbol: "Contribution" },
  });
  assert.deepEqual(validateSemanticBenchmark(graph), []);
});

test("allows reactions as a general interaction category", () => {
  const graph = validGraph();
  graph.nodes.push({
    id: "reaction",
    kind: "interaction-fact",
    meaning: "interaction",
    temporalField: "createdAt",
    source: { file: "schema-reactions.json", category: "reactions", symbol: "Reaction" },
  });
  graph.edges.push({
    from: "reaction",
    type: "made-by",
    to: "user",
    source: {
      file: "schema-reactions.json",
      category: "reactions",
      symbol: "Reaction",
      field: "user",
    },
  });

  assert.deepEqual(validateSemanticBenchmark(graph), []);
});
