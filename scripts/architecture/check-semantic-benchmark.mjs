import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const allowedCategories = new Set([
  "users",
  "enterprise-admin",
  "orgs",
  "teams",
  "repos",
  "projects",
  "issues",
  "discussions",
  "reactions",
]);

const forbiddenCategories = new Set([
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
]);

const forbiddenNodeKinds = new Set([
  "adapter",
  "database",
  "deployment",
  "module",
  "package",
  "table",
  "workflow",
]);

const requiredNodes = new Set([
  "user",
  "enterprise",
  "organization",
  "organization-team",
  "repository",
  "project",
  "work-item",
  "discussion",
]);

export function validateSemanticBenchmark(graph) {
  const errors = [];
  if (graph?.version !== 2) errors.push("Semantic benchmark: version must be 2");
  if (graph?.contract?.productAuthority !== false)
    errors.push("Semantic benchmark: productAuthority must be false");
  if (graph?.contract?.productAdoption !== "explicit-mapping-required")
    errors.push("Semantic benchmark: product adoption must require explicit mapping");
  if (graph?.role !== "derived-general-management-semantic-benchmark") {
    errors.push("Semantic benchmark: role must declare a derived benchmark, not product authority");
  }
  if (graph?.authority?.repository !== "github/docs") {
    errors.push("Semantic benchmark: authority.repository must be github/docs");
  }
  if (graph?.authority?.path !== "src/graphql/data/fpt") {
    errors.push("Semantic benchmark: authority.path must be src/graphql/data/fpt");
  }
  if (!/^[0-9a-f]{40}$/.test(graph?.authority?.revision ?? "")) {
    errors.push("Semantic benchmark: authority.revision must pin a Git commit SHA");
  }

  const included = new Set(graph?.scope?.includedCategories ?? []);
  const excluded = new Set(graph?.scope?.excludedCategories ?? []);
  for (const category of included) {
    if (!allowedCategories.has(category)) {
      errors.push(
        `Semantic benchmark: included category is outside the management allow-list: ${category}`,
      );
    }
  }
  for (const category of forbiddenCategories) {
    if (!excluded.has(category)) {
      errors.push(
        `Semantic benchmark: software-development category must stay explicitly excluded: ${category}`,
      );
    }
  }

  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const nodeIds = new Set();
  const nodeById = new Map();
  for (const node of nodes) {
    if (!node?.id || nodeIds.has(node.id)) {
      errors.push(`Semantic benchmark: node id must be unique: ${node?.id ?? "<missing>"}`);
      continue;
    }
    nodeIds.add(node.id);
    nodeById.set(node.id, node);
    if (node.kind === "event-fact" && !node.temporalField) {
      errors.push(`Semantic benchmark: event fact ${node.id} must declare its temporal field`);
    }
    if (forbiddenNodeKinds.has(node.kind)) {
      errors.push(`Semantic benchmark: implementation node kind is forbidden: ${node.kind}`);
    }
    if (!included.has(node?.source?.category)) {
      errors.push(`Semantic benchmark: node ${node.id} uses a non-included source category`);
    }
    if (!/^schema-[a-z0-9-]+\.json$/.test(node?.source?.file ?? "")) {
      errors.push(`Semantic benchmark: node ${node.id} must cite one FPT schema fragment`);
    }
    if (!node?.source?.symbol) {
      errors.push(`Semantic benchmark: node ${node.id} must cite an upstream symbol`);
    }
  }

  for (const node of nodes) {
    for (const contractId of node?.implements ?? []) {
      if (!nodeIds.has(contractId)) {
        errors.push(
          `Semantic benchmark: node ${node.id} implements missing contract: ${contractId}`,
        );
      }
    }
  }

  for (const id of requiredNodes) {
    if (!nodeIds.has(id))
      errors.push(`Semantic benchmark: required management node is missing: ${id}`);
  }

  const edgeKeys = new Set();
  for (const edge of Array.isArray(graph?.edges) ? graph.edges : []) {
    const key = `${edge?.from ?? ""}|${edge?.type ?? ""}|${edge?.to ?? ""}`;
    if (edgeKeys.has(key)) errors.push(`Semantic benchmark: duplicate edge: ${key}`);
    edgeKeys.add(key);
    if (!nodeIds.has(edge?.from))
      errors.push(`Semantic benchmark: edge source does not exist: ${edge?.from}`);
    if (!nodeIds.has(edge?.to))
      errors.push(`Semantic benchmark: edge target does not exist: ${edge?.to}`);
    if (!edge?.type) errors.push(`Semantic benchmark: edge type is required: ${key}`);
    if (!included.has(edge?.source?.category)) {
      errors.push(`Semantic benchmark: edge ${key} uses a non-included source category`);
    }
    if (!/^schema-[a-z0-9-]+\.json$/.test(edge?.source?.file ?? "")) {
      errors.push(`Semantic benchmark: edge ${key} must cite one FPT schema fragment`);
    }
    if (!edge?.source?.symbol || !edge?.source?.field) {
      errors.push(`Semantic benchmark: edge ${key} must cite upstream symbol + field evidence`);
    }
    const attributeNames = new Set();
    for (const attribute of edge?.attributes ?? []) {
      if (!attribute?.name || attributeNames.has(attribute.name)) {
        errors.push(
          `Semantic benchmark: edge ${key} attribute name must be unique: ${attribute?.name ?? "<missing>"}`,
        );
        continue;
      }
      attributeNames.add(attribute.name);
      if (!included.has(attribute?.source?.category)) {
        errors.push(
          `Semantic benchmark: edge ${key} attribute ${attribute.name} uses a non-included source category`,
        );
      }
      if (!/^schema-[a-z0-9-]+\.json$/.test(attribute?.source?.file ?? "")) {
        errors.push(
          `Semantic benchmark: edge ${key} attribute ${attribute.name} must cite one FPT schema fragment`,
        );
      }
      if (!attribute?.source?.symbol || !attribute?.source?.field) {
        errors.push(
          `Semantic benchmark: edge ${key} attribute ${attribute.name} must cite upstream symbol + field evidence`,
        );
      }
    }
  }

  const edgeKeysForReferences = new Set(
    (Array.isArray(graph?.edges) ? graph.edges : []).map(
      (edge) => `${edge?.from ?? ""}|${edge?.type ?? ""}|${edge?.to ?? ""}`,
    ),
  );

  const projectionIds = new Set();
  for (const projection of Array.isArray(graph?.projections) ? graph.projections : []) {
    if (!projection?.id || projectionIds.has(projection.id)) {
      errors.push(
        `Semantic benchmark: projection id must be unique: ${projection?.id ?? "<missing>"}`,
      );
      continue;
    }
    projectionIds.add(projection.id);
    if (!nodeIds.has(projection?.ownerNode)) {
      errors.push(
        `Semantic benchmark: projection owner node does not exist: ${projection?.ownerNode}`,
      );
    }
    if (projection.relationship && !edgeKeysForReferences.has(projection.relationship)) {
      errors.push(
        `Semantic benchmark: projection relationship does not exist: ${projection.relationship}`,
      );
    }
    const sources = projection.sources ?? (projection.source ? [projection.source] : []);
    if (!sources.length)
      errors.push(`Semantic benchmark: projection ${projection.id} must cite FPT evidence`);
    for (const source of sources) {
      if (!included.has(source?.category)) {
        errors.push(
          `Semantic benchmark: projection ${projection.id} uses a non-included source category`,
        );
      }
      if (!/^schema-[a-z0-9-]+\.json$/.test(source?.file ?? "") || !source?.symbol) {
        errors.push(`Semantic benchmark: projection ${projection.id} must cite an FPT symbol`);
      }
    }
  }

  const derivedIds = new Set();
  for (const result of Array.isArray(graph?.derivedResults) ? graph.derivedResults : []) {
    if (!result?.id || derivedIds.has(result.id)) {
      errors.push(
        `Semantic benchmark: derived result id must be unique: ${result?.id ?? "<missing>"}`,
      );
      continue;
    }
    derivedIds.add(result.id);
    if (!nodeIds.has(result?.subjectNode)) {
      errors.push(
        `Semantic benchmark: derived result subject node does not exist: ${result?.subjectNode}`,
      );
    }
    if (result?.projection && !projectionIds.has(result.projection)) {
      errors.push(
        `Semantic benchmark: derived result projection does not exist: ${result.projection}`,
      );
    }
    if (
      result?.source?.kind !== "canonical-docs" ||
      result?.source?.repository !== "github/docs" ||
      result?.source?.revision !== graph?.authority?.revision ||
      !result?.source?.path?.startsWith("content/")
    ) {
      errors.push(
        `Semantic benchmark: derived result ${result.id} must cite canonical GitHub Docs separately from FPT facts`,
      );
    }
    const model = result?.observableModel;
    if (model?.factContract && !nodeIds.has(model.factContract)) {
      errors.push(
        `Semantic benchmark: derived result fact contract does not exist: ${model.factContract}`,
      );
    }
    if (model?.factCollection && !nodeIds.has(model.factCollection)) {
      errors.push(
        `Semantic benchmark: derived result fact collection does not exist: ${model.factCollection}`,
      );
    }
    for (const eventFact of model?.eventFacts ?? []) {
      if (!nodeIds.has(eventFact)) {
        errors.push(`Semantic benchmark: derived result event fact does not exist: ${eventFact}`);
      }
    }
    for (const relationship of [
      ...(model?.actorRelationships ?? []),
      ...(model?.contextRelationships ?? []),
    ]) {
      if (!edgeKeysForReferences.has(relationship)) {
        errors.push(
          `Semantic benchmark: derived result relationship does not exist: ${relationship}`,
        );
      }
    }
    if ((model?.eventFacts ?? []).length && !(model?.timeFields ?? []).length) {
      errors.push(
        `Semantic benchmark: derived result ${result.id} must reference observable time fields`,
      );
    }
    for (const timeField of model?.timeFields ?? []) {
      const separator = timeField.lastIndexOf(".");
      const nodeId = separator > 0 ? timeField.slice(0, separator) : "";
      const field = separator > 0 ? timeField.slice(separator + 1) : "";
      const node = nodeById.get(nodeId);
      if (!node || node.kind !== "event-fact" || node.temporalField !== field) {
        errors.push(
          `Semantic benchmark: derived result time field is not backed by an event fact: ${timeField}`,
        );
      }
    }
  }

  const supplemental = Array.isArray(graph?.supplementalEvidence) ? graph.supplementalEvidence : [];
  for (const evidence of supplemental) {
    if (
      evidence?.kind !== "canonical-docs" ||
      evidence?.repository !== "github/docs" ||
      evidence?.revision !== graph?.authority?.revision ||
      !evidence?.path?.startsWith("content/")
    ) {
      errors.push(
        "Semantic benchmark: supplemental evidence must be pinned canonical github/docs content",
      );
    }
  }
  for (const result of Array.isArray(graph?.derivedResults) ? graph.derivedResults : []) {
    const matched = supplemental.some(
      (evidence) =>
        evidence?.kind === result?.source?.kind &&
        evidence?.repository === result?.source?.repository &&
        evidence?.revision === result?.source?.revision &&
        evidence?.path === result?.source?.path,
    );
    if (!matched) {
      errors.push(
        `Semantic benchmark: derived result ${result.id} source must be declared as supplemental evidence`,
      );
    }
  }

  return errors;
}

export async function checkSemanticBenchmark(
  file = resolve(
    fileURLToPath(new URL("../../", import.meta.url)),
    "architecture/semantic-benchmark.json",
  ),
) {
  let graph;
  try {
    graph = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    return {
      errors: [`Semantic benchmark: unable to read graph: ${error.message}`],
      nodeCount: 0,
      edgeCount: 0,
    };
  }
  const errors = validateSemanticBenchmark(graph);
  return {
    errors,
    nodeCount: Array.isArray(graph.nodes) ? graph.nodes.length : 0,
    edgeCount: Array.isArray(graph.edges) ? graph.edges.length : 0,
  };
}

if (import.meta.main) {
  const result = await checkSemanticBenchmark();
  for (const error of result.errors) console.error(error);
  console.log(
    `Semantic benchmark: ${result.nodeCount} nodes, ${result.edgeCount} edges, ${result.errors.length} violations.`,
  );
  if (result.errors.length) process.exitCode = 1;
}
