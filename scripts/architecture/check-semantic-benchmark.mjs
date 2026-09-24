import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const allowedInventoryRoles = new Set([
  "schema-fragment",
  "category-index",
  "rendered-schema",
  "preview",
  "future-change",
  "history",
]);

const allowedSchemaDispositions = new Set(["included", "reference-only", "excluded"]);

const requiredInventoryRoles = new Set([
  "schema-fragment",
  "category-index",
  "rendered-schema",
  "preview",
  "future-change",
  "history",
]);

const forbiddenScmCategories = new Set([
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

const fixedOutputRoles = new Map([
  ["category-map.json", "category-index"],
  ["changelog.json", "history"],
  ["graphql_upcoming_changes.public.yml", "future-change"],
  ["previews.json", "preview"],
  ["schema.docs.graphql", "rendered-schema"],
  ["upcoming-changes.json", "future-change"],
]);

function categoryFromSchemaFile(file) {
  const match = /^schema-([a-z0-9-]+)\.json$/.exec(file ?? "");
  return match?.[1] ?? null;
}

function sourceInventoryGitTreeSha(entries) {
  const treeEntries = entries.map((entry) => {
    if (!entry?.file || !/^[0-9a-f]{40}$/.test(entry?.gitBlobSha ?? "")) return null;
    return { file: entry.file, gitBlobSha: entry.gitBlobSha };
  });
  if (treeEntries.some((entry) => entry === null)) return null;

  treeEntries.sort((left, right) =>
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

function buildInventory(graph, errors) {
  const inventory = Array.isArray(graph?.sourceInventory) ? graph.sourceInventory : [];
  if (!Array.isArray(graph?.sourceInventory)) {
    errors.push("Semantic benchmark: sourceInventory must be an array");
  }

  const byFile = new Map();
  const seenCategories = new Set();
  const seenRoles = new Set();
  for (const entry of inventory) {
    const file = entry?.file ?? "<missing>";
    if (!entry?.file || byFile.has(entry.file)) {
      errors.push(`Semantic benchmark: sourceInventory file must be unique: ${file}`);
      continue;
    }
    byFile.set(entry.file, entry);
    if (!/^[0-9a-f]{40}$/.test(entry?.gitBlobSha ?? "")) {
      errors.push(`Semantic benchmark: sourceInventory ${file} must pin a Git blob SHA`);
    }
    if (!allowedInventoryRoles.has(entry?.role)) {
      errors.push(`Semantic benchmark: sourceInventory ${file} has invalid role: ${entry?.role}`);
    } else {
      seenRoles.add(entry.role);
    }
    if (!entry?.reason) {
      errors.push(`Semantic benchmark: sourceInventory ${file} must explain the scope decision`);
    }

    const schemaCategory = categoryFromSchemaFile(entry.file);
    if (entry?.role === "schema-fragment") {
      if (!schemaCategory) {
        errors.push(
          `Semantic benchmark: sourceInventory ${file} role must match a schema fragment`,
        );
      }
      if (entry?.category !== schemaCategory) {
        errors.push(
          `Semantic benchmark: sourceInventory ${file} category must match its schema file name`,
        );
      }
      if (!allowedSchemaDispositions.has(entry?.disposition)) {
        errors.push(
          `Semantic benchmark: sourceInventory ${file} has invalid schema disposition: ${entry?.disposition}`,
        );
      }
      if (entry?.category) seenCategories.add(entry.category);
    } else {
      if (schemaCategory) {
        errors.push(
          `Semantic benchmark: sourceInventory ${file} schema file must use schema-fragment role`,
        );
      }
      const expectedRole = fixedOutputRoles.get(entry.file);
      if (expectedRole && entry.role !== expectedRole) {
        errors.push(
          `Semantic benchmark: sourceInventory ${file} must use output role ${expectedRole}`,
        );
      }
      if (entry?.category || entry?.disposition) {
        errors.push(
          `Semantic benchmark: sourceInventory ${file} non-schema output must not declare category or disposition`,
        );
      }
    }
  }

  for (const role of requiredInventoryRoles) {
    if (!seenRoles.has(role)) {
      errors.push(`Semantic benchmark: sourceInventory missing output family role: ${role}`);
    }
  }
  for (const category of forbiddenScmCategories) {
    const entry = [...byFile.values()].find((item) => item.category === category);
    if (!entry) {
      errors.push(
        `Semantic benchmark: SCM/software category is missing from inventory: ${category}`,
      );
    } else if (entry.disposition !== "excluded") {
      errors.push(`Semantic benchmark: SCM/software category must stay excluded: ${category}`);
    }
  }

  const metadata = graph?.sourceInventoryMetadata;
  if (!metadata) {
    errors.push("Semantic benchmark: sourceInventoryMetadata is required");
  } else {
    if (!/^[0-9a-f]{40}$/.test(metadata.gitTreeSha ?? "")) {
      errors.push("Semantic benchmark: sourceInventoryMetadata.gitTreeSha must pin a Git tree SHA");
    }
    const computedTreeSha = sourceInventoryGitTreeSha(inventory);
    if (computedTreeSha && metadata.gitTreeSha !== computedTreeSha) {
      errors.push(
        "Semantic benchmark: sourceInventoryMetadata.gitTreeSha does not match inventory",
      );
    }
    if (/\blatest\b/i.test(metadata.source ?? "")) {
      errors.push("Semantic benchmark: sourceInventoryMetadata.source must describe a pinned tree");
    }
  }

  return { byFile, seenCategories };
}

function inventoryEntryForSource(source, inventory, errors, context, allowedDispositions) {
  const entry = inventory.byFile.get(source?.file);
  if (!entry) {
    errors.push(`Semantic benchmark: ${context} cites a file outside sourceInventory`);
    return null;
  }
  if (entry.role !== "schema-fragment") {
    errors.push(`Semantic benchmark: ${context} must cite one FPT schema fragment`);
    return entry;
  }
  if (source?.category !== entry.category) {
    errors.push(`Semantic benchmark: ${context} category must match sourceInventory`);
  }
  if (!allowedDispositions.has(entry.disposition)) {
    errors.push(
      `Semantic benchmark: ${context} uses ${entry.disposition} source category: ${entry.category}`,
    );
  }
  return entry;
}

function validateSymbolSource(
  source,
  errors,
  context,
  inventory,
  allowedDispositions,
  options = {},
) {
  inventoryEntryForSource(source, inventory, errors, context, allowedDispositions);
  if (!/^schema-[a-z0-9-]+\.json$/.test(source?.file ?? "")) {
    errors.push(`Semantic benchmark: ${context} must cite one FPT schema fragment`);
  }
  if (!source?.symbol) {
    errors.push(`Semantic benchmark: ${context} must cite an upstream symbol`);
  }
  if (options.field === "required" && !source?.field) {
    errors.push(`Semantic benchmark: ${context} must cite upstream symbol + field evidence`);
  }
}

function validateSourcePipeline(graph, errors) {
  const pipeline = Array.isArray(graph?.sourcePipeline) ? graph.sourcePipeline : [];
  if (!pipeline.length) {
    errors.push("Semantic benchmark: sourcePipeline must cite pinned upstream pipeline evidence");
    return;
  }

  const ids = new Set();
  const inventoryRoles = new Set((graph?.sourceInventory ?? []).map((entry) => entry.role));
  const pipelineFamilies = new Set();
  for (const stage of pipeline) {
    if (!stage?.id || ids.has(stage.id)) {
      errors.push(
        `Semantic benchmark: sourcePipeline id must be unique: ${stage?.id ?? "<missing>"}`,
      );
      continue;
    }
    ids.add(stage.id);
    if (!stage?.meaning) {
      errors.push(`Semantic benchmark: sourcePipeline ${stage.id} must explain meaning`);
    }
    if (
      stage?.source?.repository !== graph?.authority?.repository ||
      stage?.source?.revision !== graph?.authority?.revision ||
      !stage?.source?.path?.startsWith("src/graphql/")
    ) {
      errors.push(
        `Semantic benchmark: sourcePipeline ${stage.id} must cite pinned github/docs src/graphql source`,
      );
    }
    if (!Array.isArray(stage?.outputFamilies) || stage.outputFamilies.length === 0) {
      errors.push(`Semantic benchmark: sourcePipeline ${stage.id} must declare output families`);
      continue;
    }
    for (const family of stage.outputFamilies) {
      pipelineFamilies.add(family);
      if (!inventoryRoles.has(family)) {
        errors.push(
          `Semantic benchmark: sourcePipeline ${stage.id} references missing inventory family: ${family}`,
        );
      }
    }
  }
  for (const role of requiredInventoryRoles) {
    if (inventoryRoles.has(role) && !pipelineFamilies.has(role)) {
      errors.push(`Semantic benchmark: sourcePipeline does not cover inventory family: ${role}`);
    }
  }
}

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

  if (graph?.scope?.includedCategories || graph?.scope?.excludedCategories) {
    errors.push(
      "Semantic benchmark: scope categories must be owned by sourceInventory, not duplicated in scope",
    );
  }

  const inventory = buildInventory(graph, errors);
  validateSourcePipeline(graph, errors);
  const domainDispositions = new Set(["included"]);
  const referenceDispositions = new Set(["included", "reference-only"]);

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
    validateSymbolSource(node?.source, errors, `node ${node.id}`, inventory, domainDispositions);
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
    validateSymbolSource(edge?.source, errors, `edge ${key}`, inventory, domainDispositions, {
      field: "required",
    });
    const attributeNames = new Set();
    for (const attribute of edge?.attributes ?? []) {
      if (!attribute?.name || attributeNames.has(attribute.name)) {
        errors.push(
          `Semantic benchmark: edge ${key} attribute name must be unique: ${attribute?.name ?? "<missing>"}`,
        );
        continue;
      }
      attributeNames.add(attribute.name);
      validateSymbolSource(
        attribute?.source,
        errors,
        `edge ${key} attribute ${attribute.name}`,
        inventory,
        domainDispositions,
        { field: "required" },
      );
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
      validateSymbolSource(
        source,
        errors,
        `projection ${projection.id}`,
        inventory,
        domainDispositions,
      );
    }
  }

  const referenceIds = new Set();
  for (const contract of Array.isArray(graph?.referenceContracts) ? graph.referenceContracts : []) {
    if (!contract?.id || referenceIds.has(contract.id)) {
      errors.push(
        `Semantic benchmark: reference contract id must be unique: ${contract?.id ?? "<missing>"}`,
      );
      continue;
    }
    referenceIds.add(contract.id);
    if (!contract?.meaning) {
      errors.push(`Semantic benchmark: reference contract ${contract.id} must explain meaning`);
    }
    if (!Array.isArray(contract?.sources) || contract.sources.length === 0) {
      errors.push(`Semantic benchmark: reference contract ${contract.id} must cite FPT sources`);
      continue;
    }
    for (const source of contract.sources) {
      validateSymbolSource(
        source,
        errors,
        `reference contract ${contract.id}`,
        inventory,
        referenceDispositions,
      );
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
