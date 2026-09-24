import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileDataTopology, loadDataTopologySources } from "./data-topology-core.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

function indexById(items, label, errors) {
  const map = new Map();
  for (const item of items ?? []) {
    if (!item?.id) {
      errors.push(label + ": id is required");
      continue;
    }
    if (map.has(item.id)) errors.push(label + ": duplicate id " + item.id);
    map.set(item.id, item);
  }
  return map;
}

function requireCollection(model, key, errors) {
  if (!Array.isArray(model?.[key]) || model[key].length === 0) {
    errors.push("Semantic model: " + key + " must be a non-empty collection");
  }
}

function commandScript(command) {
  if (typeof command !== "string") return null;
  return /^pnpm\s+([A-Za-z0-9:_-]+)(?:\s|$)/.exec(command.trim())?.[1] ?? null;
}

export function validateSemanticArchitecture(model, benchmark, topology, commandManifest = null) {
  const errors = [];
  if (model?.version !== 1 || model?.role !== "canonical-product-semantic-architecture") {
    errors.push("Semantic model: expected version 1 canonical-product-semantic-architecture");
  }
  if (
    benchmark?.version !== 2 ||
    benchmark?.role !== "derived-general-management-semantic-benchmark"
  ) {
    errors.push(
      "Semantic model: external benchmark must be version 2 derived-general-management-semantic-benchmark",
    );
  }
  if (benchmark?.contract?.productAuthority !== false) {
    errors.push("Semantic model: benchmark must explicitly deny product authority");
  }
  if (topology?.version !== 2 || topology?.role !== "implementation-topology") {
    errors.push("Semantic model: manifest must be version 2 implementation-topology");
  }
  if (topology?.semanticModel !== "architecture/semantic-model.json") {
    errors.push("Semantic model: manifest must point to architecture/semantic-model.json");
  }

  for (const key of [
    "semanticOwners",
    "conceptTypes",
    "boundaryTypes",
    "integrationModes",
    "concepts",
    "relationships",
    "invariants",
    "truthRegistry",
    "policies",
  ]) {
    requireCollection(model, key, errors);
  }

  const owners = indexById(model?.semanticOwners, "Semantic owner", errors);
  const contexts = indexById(model?.boundedContexts, "Bounded context", errors);
  const conceptTypes = indexById(model?.conceptTypes, "Concept type", errors);
  const boundaryTypes = indexById(model?.boundaryTypes, "Boundary type", errors);
  const integrationModes = indexById(model?.integrationModes, "Integration mode", errors);
  const concepts = indexById(model?.concepts, "Concept", errors);
  const relationships = indexById(model?.relationships, "Relationship", errors);
  const capabilities = indexById(model?.capabilities, "Capability", errors);
  const invariants = indexById(model?.invariants, "Invariant", errors);
  indexById(model?.truthRegistry, "Truth registry", errors);
  indexById(model?.policies, "Policy", errors);

  const requiredBoundaryTypes = [
    "semantic",
    "module",
    "data",
    "consistency",
    "transaction",
    "trust",
    "runtime",
  ];
  for (const type of requiredBoundaryTypes) {
    if (!boundaryTypes.has(type)) errors.push("Boundary type missing: " + type);
  }

  for (const context of contexts.values()) {
    const contextOwners = context.owners ?? (context.owner ? [context.owner] : []);
    if (!contextOwners.length) errors.push("Bounded context " + context.id + ": owner is required");
    for (const owner of contextOwners) {
      if (!owners.has(owner)) {
        errors.push("Bounded context " + context.id + ": unknown owner " + owner);
      }
    }
  }

  const benchmarkNodes = new Set((benchmark?.nodes ?? []).map((node) => node.id));
  for (const concept of concepts.values()) {
    if (!owners.has(concept.owner)) {
      errors.push("Concept " + concept.id + ": unknown owner " + concept.owner);
    }
    const conceptType = conceptTypes.get(concept.kind);
    if (!conceptType) {
      errors.push("Concept " + concept.id + ": unsupported concept kind " + concept.kind);
    } else if (concept.authorityMode !== conceptType.authorityMode) {
      errors.push(
        "Concept " +
          concept.id +
          ": authorityMode must be " +
          conceptType.authorityMode +
          " for " +
          concept.kind,
      );
    }
    if (concept.benchmark?.node && !benchmarkNodes.has(concept.benchmark.node)) {
      errors.push("Concept " + concept.id + ": missing benchmark node " + concept.benchmark.node);
    }
    if (concept.kind === "derived-projection" && !(concept.derivedFrom ?? []).length) {
      errors.push("Concept " + concept.id + ": derived projection requires derivedFrom");
    }
    for (const source of concept.derivedFrom ?? []) {
      if (!concepts.has(source)) {
        errors.push("Concept " + concept.id + ": missing derived source " + source);
      }
    }
  }

  const requiredRelationshipFields = model?.contractModel?.requiredRelationshipFields ?? [];
  for (const relationship of relationships.values()) {
    for (const field of requiredRelationshipFields) {
      if (
        relationship[field] === undefined ||
        relationship[field] === null ||
        relationship[field] === ""
      ) {
        errors.push("Relationship " + relationship.id + ": missing contract field " + field);
      }
    }
    if (!owners.has(relationship.provider)) {
      errors.push(
        "Relationship " + relationship.id + ": unknown provider " + relationship.provider,
      );
    }
    if (!owners.has(relationship.consumer)) {
      errors.push(
        "Relationship " + relationship.id + ": unknown consumer " + relationship.consumer,
      );
    }
    if (!owners.has(relationship.authority)) {
      errors.push(
        "Relationship " + relationship.id + ": unknown authority " + relationship.authority,
      );
    }
    if (!integrationModes.has(relationship.integrationMode)) {
      errors.push(
        "Relationship " +
          relationship.id +
          ": unsupported integration mode " +
          relationship.integrationMode,
      );
    }
    if (relationship.authority !== relationship.provider) {
      errors.push(
        "Relationship " +
          relationship.id +
          ": consumer contract must not transfer provider authority",
      );
    }
  }

  for (const capability of capabilities.values()) {
    if (!owners.has(capability.owner)) {
      errors.push("Capability " + capability.id + ": unknown owner " + capability.owner);
    }
    for (const invariantId of capability.preserves ?? []) {
      if (!invariants.has(invariantId)) {
        errors.push("Capability " + capability.id + ": unknown invariant " + invariantId);
      }
    }
  }

  const runtimeExpectations = new Set(["required", "not-asserted"]);
  for (const capability of capabilities.values()) {
    if (!runtimeExpectations.has(capability.runtimeExpectation)) {
      errors.push(
        "Capability " + capability.id + ": runtimeExpectation must be required or not-asserted",
      );
    }
  }

  const evidenceClasses = indexById(model?.evidenceModel?.classes, "Evidence class", errors);
  const validationProfiles = indexById(
    model?.evidenceModel?.validationProfiles,
    "Validation profile",
    errors,
  );
  for (const profile of validationProfiles.values()) {
    if (!evidenceClasses.has(profile.evidenceClass)) {
      errors.push(
        "Validation profile " + profile.id + ": unknown evidence class " + profile.evidenceClass,
      );
    }
    const script = commandScript(profile.command);
    if (!script) {
      errors.push("Validation profile " + profile.id + ": command must start with pnpm <script>");
    } else if (commandManifest && !commandManifest.scripts?.[script]) {
      errors.push(
        "Validation profile " + profile.id + ": unknown package.json command " + profile.command,
      );
    }
    if (!(profile.proves ?? []).length) {
      errors.push("Validation profile " + profile.id + ": proves must not be empty");
    }
  }
  const feedback = model?.evidenceModel?.feedback;
  if (feedback?.bundleVersion !== 1) {
    errors.push("Feedback model: bundleVersion must be 1");
  }
  if (feedback?.claimSubject !== "capability") {
    errors.push("Feedback model: claimSubject must be capability");
  }
  if (JSON.stringify(feedback?.statuses ?? []) !== JSON.stringify(["pass", "fail", "unknown"])) {
    errors.push("Feedback model: statuses must be pass, fail, unknown");
  }
  if (
    feedback?.revisionProposal?.derived !== true ||
    feedback?.revisionProposal?.autoApply !== false
  ) {
    errors.push("Feedback model: revision proposals must be derived and non-automatic");
  }
  if (!(feedback?.channels ?? []).length) {
    errors.push("Feedback model: at least one evidence channel is required");
  }
  for (const channel of model?.evidenceModel?.feedback?.channels ?? []) {
    if (!evidenceClasses.has(channel.evidenceClass)) {
      errors.push(
        "Feedback channel " + channel.id + ": unknown evidence class " + channel.evidenceClass,
      );
    }
  }
  for (const capability of capabilities.values()) {
    for (const profileId of capability.validationProfiles ?? []) {
      if (!validationProfiles.has(profileId)) {
        errors.push("Capability " + capability.id + ": unknown validation profile " + profileId);
      }
    }
  }

  const modules = topology?.modules ?? {};
  const applications = topology?.applications ?? {};
  const allWorkspace = new Set([...Object.keys(modules), ...Object.keys(applications)]);
  for (const [name, entry] of Object.entries(modules)) {
    if (!entry.semanticOwner || !owners.has(entry.semanticOwner)) {
      errors.push("Implementation topology module " + name + ": semanticOwner must resolve");
    }
    if (entry.moduleKind === "bounded-context") {
      errors.push(
        "Implementation topology module " +
          name +
          ": moduleKind must not masquerade as a Bounded Context",
      );
    }
    for (const dependency of entry.allowedWorkspaceDependencies ?? []) {
      if (!allWorkspace.has(dependency)) {
        errors.push(
          "Implementation topology module " + name + ": unknown allowed dependency " + dependency,
        );
      }
    }
  }
  for (const [name, entry] of Object.entries(applications)) {
    for (const dependency of entry.allowedWorkspaceDependencies ?? []) {
      if (!allWorkspace.has(dependency)) {
        errors.push("Manifest application " + name + ": unknown allowed dependency " + dependency);
      }
    }
  }

  const mappedOwners = new Set();
  const mappingByOwner = new Map();
  for (const mapping of model?.implementationMappings ?? []) {
    if (!owners.has(mapping.semanticOwner)) {
      errors.push("Implementation mapping: unknown semantic owner " + mapping.semanticOwner);
    }
    if (mappedOwners.has(mapping.semanticOwner)) {
      errors.push("Implementation mapping: duplicate semantic owner " + mapping.semanticOwner);
    }
    mappedOwners.add(mapping.semanticOwner);
    mappingByOwner.set(mapping.semanticOwner, mapping);
    if (mapping.module !== null && mapping.module !== undefined) {
      if (!modules[mapping.module]) {
        errors.push(
          "Implementation mapping " + mapping.semanticOwner + ": unknown module " + mapping.module,
        );
      } else if (modules[mapping.module].semanticOwner !== mapping.semanticOwner) {
        errors.push(
          "Implementation mapping " +
            mapping.semanticOwner +
            ": manifest module owner disagrees for " +
            mapping.module,
        );
      }
    }
  }
  for (const [name, entry] of Object.entries(modules)) {
    if (!mappedOwners.has(entry.semanticOwner)) {
      errors.push(
        "Implementation topology module " + name + ": semantic owner lacks implementation mapping",
      );
    }
  }
  for (const owner of owners.values()) {
    if (owner.lifecycle === "selected-target" && mappingByOwner.get(owner.id)?.module != null) {
      errors.push(
        "Semantic owner " + owner.id + ": selected-target must not assert a runtime module",
      );
    }
  }

  for (const capability of capabilities.values()) {
    const owner = owners.get(capability.owner);
    const mapping = mappingByOwner.get(capability.owner);
    if (
      capability.runtimeExpectation === "required" &&
      (!mapping?.module ||
        owner?.lifecycle === "selected-target" ||
        owner?.lifecycle === "current-data-only")
    ) {
      errors.push(
        "Capability " +
          capability.id +
          ": required runtime expectation needs a current runtime module owner",
      );
    }
  }

  const policyKinds = new Set([
    "single-concept-owner",
    "relationship-endpoints-exist",
    "benchmark-mapping-must-exist",
    "derived-concept-cannot-be-authoritative",
    "implementation-mapping-must-resolve",
    "module-owner-must-resolve",
    "selected-target-module-not-required",
    "workspace-dependency-must-resolve",
    "consumer-contract",
    "evidence-scope-integrity",
    "runtime-feedback-derived-proposal",
    "data-topology-integrity",
  ]);
  for (const policy of model?.policies ?? []) {
    if (!policyKinds.has(policy.kind)) {
      errors.push("Policy " + policy.id + ": unsupported kind " + policy.kind);
    }
    if (!policy.rationale || !policy.remediation) {
      errors.push("Policy " + policy.id + ": rationale and remediation are required");
    }
  }

  return errors;
}

export function compileSemanticArchitecture(
  model,
  benchmark,
  topology,
  commandManifest = null,
  dataTopology = null,
  schemaFiles = [],
  relationsByFile = new Map(),
) {
  const errors = validateSemanticArchitecture(model, benchmark, topology, commandManifest);
  const data = dataTopology
    ? compileDataTopology(model, dataTopology, schemaFiles, relationsByFile)
    : { errors: [], dataTopology: null, surfaces: new Map(), byOwner: new Map(), schemaFiles: [] };
  errors.push(...data.errors);
  const owners = new Map((model.semanticOwners ?? []).map((item) => [item.id, item]));
  const concepts = new Map((model.concepts ?? []).map((item) => [item.id, item]));
  const relationships = new Map((model.relationships ?? []).map((item) => [item.id, item]));
  const capabilities = new Map((model.capabilities ?? []).map((item) => [item.id, item]));
  const invariants = new Map((model.invariants ?? []).map((item) => [item.id, item]));
  const mappings = new Map(
    (model.implementationMappings ?? []).map((item) => [item.semanticOwner, item]),
  );
  const benchmarkNodes = new Map((benchmark.nodes ?? []).map((item) => [item.id, item]));
  const validationProfiles = new Map(
    (model.evidenceModel?.validationProfiles ?? []).map((item) => [item.id, item]),
  );
  const adjacency = new Map();
  for (const owner of owners.keys()) adjacency.set(owner, new Set());
  for (const relationship of relationships.values()) {
    if (!adjacency.has(relationship.provider)) adjacency.set(relationship.provider, new Set());
    if (!adjacency.has(relationship.consumer)) adjacency.set(relationship.consumer, new Set());
    adjacency.get(relationship.provider).add(relationship.consumer);
    adjacency.get(relationship.consumer).add(relationship.provider);
  }
  return {
    errors,
    model,
    benchmark,
    topology,
    commandManifest,
    owners,
    concepts,
    relationships,
    capabilities,
    invariants,
    mappings,
    benchmarkNodes,
    validationProfiles,
    dataTopology: data.dataTopology,
    dataSurfaces: data.surfaces,
    dataByOwner: data.byOwner,
    schemaFiles: data.schemaFiles,
    adjacency,
  };
}

export async function loadSemanticArchitecture(root = repositoryRoot) {
  const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
  const [model, benchmark, topology, commandManifest, dataSources] = await Promise.all([
    readJson("architecture/semantic-model.json"),
    readJson("architecture/semantic-benchmark.json"),
    readJson("architecture/implementation-topology.json"),
    readJson("package.json"),
    loadDataTopologySources(root),
  ]);
  return compileSemanticArchitecture(
    model,
    benchmark,
    topology,
    commandManifest,
    dataSources.dataTopology,
    dataSources.schemaFiles,
    dataSources.relationsByFile,
  );
}
