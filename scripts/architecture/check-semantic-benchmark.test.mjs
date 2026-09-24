import assert from "node:assert/strict";
import test from "node:test";
import { validateSemanticBenchmark } from "./check-semantic-benchmark.mjs";

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

  return {
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
      includedCategories: [
        "users",
        "enterprise-admin",
        "orgs",
        "teams",
        "repos",
        "projects",
        "issues",
        "discussions",
        "reactions",
      ],
      excludedCategories: [
        "actions",
        "branches",
        "checks",
        "code-scanning",
        "code-security",
        "codespaces",
        "commits",
        "dependabot",
        "dependency-graph",
        "deploy-keys",
        "deployments",
        "git",
        "packages",
        "pages",
        "pulls",
        "releases",
        "secret-scanning",
        "security-advisories",
      ],
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
}

test("accepts the minimum management graph", () => {
  assert.deepEqual(validateSemanticBenchmark(validGraph()), []);
});

test("rejects software-development categories", () => {
  const graph = validGraph();
  graph.scope.includedCategories.push("git");
  assert.match(validateSemanticBenchmark(graph).join("\n"), /outside the management allow-list/);
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
        revision: "03d2e24b34bd88c361f1185f0aae1c46062c6510",
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
