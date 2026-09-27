import { readFile, stat } from "node:fs/promises";
import { posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSemanticBenchmark } from "./check-semantic-benchmark.mjs";
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

function unique(values) {
  return new Set(values).size === values.length;
}

function benchmarkItems(benchmark) {
  return [
    ...(benchmark?.nodes ?? []).map((item) => ({ kind: "node", id: item.id })),
    ...(benchmark?.projections ?? []).map((item) => ({ kind: "projection", id: item.id })),
    ...(benchmark?.derivedResults ?? []).map((item) => ({
      kind: "derived-result",
      id: item.id,
    })),
    ...(benchmark?.referenceContracts ?? []).map((item) => ({
      kind: "reference-contract",
      id: item.id,
    })),
  ];
}

function implementationStatus(capability) {
  return capability.implementation?.status ?? "missing";
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
    "capabilities",
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
  const locators = indexById(model?.locators, "Locator", errors);
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

  const lifecycles = new Set([
    "current",
    "current-foundation",
    "current-data-only",
    "selected-target",
  ]);
  for (const owner of owners.values()) {
    if (!lifecycles.has(owner.lifecycle)) {
      errors.push("Semantic owner " + owner.id + ": unsupported lifecycle " + owner.lifecycle);
    }
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
  const benchmarkInventory = new Map(
    (benchmark?.sourceInventory ?? []).map((source) => [source.file, source]),
  );
  for (const concept of concepts.values()) {
    if (!owners.has(concept.owner)) {
      errors.push("Concept " + concept.id + ": unknown owner " + concept.owner);
    }
    if (!lifecycles.has(concept.lifecycle)) {
      errors.push("Concept " + concept.id + ": unsupported lifecycle " + concept.lifecycle);
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
    if (!["leaf", "aggregate"].includes(capability.kind)) {
      errors.push("Capability " + capability.id + ": kind must be leaf or aggregate");
    }
    if (typeof capability.intent !== "string" || !capability.intent.trim()) {
      errors.push("Capability " + capability.id + ": intent is required");
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

  const implementationStatuses = new Set([
    "implemented",
    "data-only",
    "foundation",
    "not-implemented",
  ]);
  for (const capability of capabilities.values()) {
    if (capability.kind === "leaf") {
      if (capability.members !== undefined) {
        errors.push("Capability " + capability.id + ": leaf must not declare aggregate members");
      }
      const implementation = capability.implementation;
      if (!implementation || typeof implementation !== "object") {
        errors.push("Capability " + capability.id + ": leaf requires implementation evidence");
        continue;
      }
      if (!implementationStatuses.has(implementation.status)) {
        errors.push(
          "Capability " +
            capability.id +
            ": implementation.status must be implemented, data-only, foundation, or not-implemented",
        );
      }
      for (const key of ["sourcePaths", "publicExports", "entrypoints", "testPaths"]) {
        if (!Array.isArray(implementation[key])) {
          errors.push(
            "Capability " + capability.id + ": implementation." + key + " must be an array",
          );
        }
      }
      if (typeof implementation.scope !== "string" || !implementation.scope.trim()) {
        errors.push("Capability " + capability.id + ": implementation.scope is required");
      }
      if (typeof implementation.note !== "string" || !implementation.note.trim()) {
        errors.push("Capability " + capability.id + ": implementation.note is required");
      }
      if (
        capability.runtimeExpectation === "required" &&
        (implementation.status !== "implemented" ||
          !(implementation.sourcePaths ?? []).length ||
          !(implementation.publicExports ?? []).length)
      ) {
        errors.push(
          "Capability " +
            capability.id +
            ": required runtime expectation needs implemented sourcePaths and publicExports evidence",
        );
      }
    } else if (capability.kind === "aggregate") {
      if (capability.implementation !== undefined) {
        errors.push(
          "Capability " + capability.id + ": aggregate must not declare leaf implementation",
        );
      }
      if (!Array.isArray(capability.members) || capability.members.length === 0) {
        errors.push("Capability " + capability.id + ": aggregate requires members");
        continue;
      }
      if (!unique(capability.members)) {
        errors.push("Capability " + capability.id + ": aggregate members must be unique");
      }
      let hasNotRequiredMember = false;
      for (const memberId of capability.members) {
        const member = capabilities.get(memberId);
        if (!member) {
          errors.push("Capability " + capability.id + ": unknown member " + memberId);
          continue;
        }
        if (member.kind !== "leaf") {
          errors.push("Capability " + capability.id + ": member " + memberId + " must be leaf");
        }
        if (member.owner !== capability.owner) {
          errors.push(
            "Capability " + capability.id + ": member " + memberId + " has different owner",
          );
        }
        if (member.runtimeExpectation !== "required") hasNotRequiredMember = true;
      }
      if (capability.runtimeExpectation === "required" && hasNotRequiredMember) {
        errors.push("Capability " + capability.id + ": partial aggregate must not be required");
      }
    }
  }

  for (const locator of locators.values()) {
    const concept = concepts.get(locator.concept);
    if (!concept) {
      errors.push("Locator " + locator.id + ": unknown concept " + locator.concept);
    }
    if (!Array.isArray(locator.fields) || locator.fields.length === 0) {
      errors.push("Locator " + locator.id + ": fields must be non-empty");
    } else if (!unique(locator.fields)) {
      errors.push("Locator " + locator.id + ": fields must be unique");
    }
    if (typeof locator.scope !== "string" || !locator.scope.trim()) {
      errors.push("Locator " + locator.id + ": scope is required");
    }
    if (!["active", "reference-only"].includes(locator.status)) {
      errors.push("Locator " + locator.id + ": status must be active or reference-only");
    }
    if (locator.status === "active" && !(locator.routeFiles ?? []).length) {
      errors.push("Locator " + locator.id + ": active locator requires routeFiles");
    }
    if (
      locator.status === "active" &&
      ["current-data-only", "selected-target"].includes(concept?.lifecycle)
    ) {
      errors.push(
        "Locator " + locator.id + ": inactive concept lifecycle cannot claim active locator",
      );
    }
    const source = locator.benchmark;
    if (source) {
      const inventory = benchmarkInventory.get(source.file);
      if (!inventory) {
        errors.push("Locator " + locator.id + ": unknown benchmark source " + source.file);
      } else if (!["included", "reference-only"].includes(inventory.disposition)) {
        errors.push(
          "Locator " + locator.id + ": benchmark source must be included or reference-only",
        );
      }
    }
  }

  const mappedNodes = new Set(
    [...concepts.values()].map((concept) => concept.benchmark?.node).filter(Boolean),
  );
  const externalItems = benchmarkItems(benchmark);
  const externalItemKeys = new Set(externalItems.map((item) => item.kind + ":" + item.id));
  const decisionKeys = new Set();
  for (const decision of model?.benchmarkDecisions ?? []) {
    const key = decision.kind + ":" + decision.id;
    if (decisionKeys.has(key)) errors.push("Benchmark decision: duplicate " + key);
    decisionKeys.add(key);
    if (!externalItemKeys.has(key)) {
      errors.push("Benchmark decision " + key + ": unknown external item");
    }
    if (decision.kind === "node" && mappedNodes.has(decision.id)) {
      errors.push("Benchmark decision " + key + ": mapped benchmark nodes must not be duplicated");
    }
    if (!["adopted", "deferred", "not-applicable"].includes(decision.status)) {
      errors.push("Benchmark decision " + key + ": unsupported status " + decision.status);
    }
    if (typeof decision.reason !== "string" || !decision.reason.trim()) {
      errors.push("Benchmark decision " + key + ": reason is required");
    }
    for (const conceptId of decision.concepts ?? []) {
      if (!concepts.has(conceptId))
        errors.push("Benchmark decision " + key + ": unknown concept " + conceptId);
    }
    for (const capabilityId of decision.capabilities ?? []) {
      if (!capabilities.has(capabilityId)) {
        errors.push("Benchmark decision " + key + ": unknown capability " + capabilityId);
      }
    }
    for (const locatorId of decision.locators ?? []) {
      if (!locators.has(locatorId))
        errors.push("Benchmark decision " + key + ": unknown locator " + locatorId);
    }
    if (
      decision.status !== "adopted" &&
      ((decision.concepts ?? []).length ||
        (decision.capabilities ?? []).length ||
        (decision.locators ?? []).length)
    ) {
      errors.push("Benchmark decision " + key + ": only adopted decisions may carry product basis");
    }
    if (
      decision.status === "adopted" &&
      !(
        (decision.concepts ?? []).length ||
        (decision.capabilities ?? []).length ||
        (decision.locators ?? []).length
      )
    ) {
      errors.push(
        "Benchmark decision " + key + ": adopted requires concept, capability, or locator basis",
      );
    }
  }
  for (const item of externalItems) {
    if (item.kind === "node" && mappedNodes.has(item.id)) continue;
    const key = item.kind + ":" + item.id;
    if (!decisionKeys.has(key))
      errors.push("Benchmark decision missing explicit disposition for " + key);
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

  const ownerKinds = new Map([...owners.values()].map((owner) => [owner.id, owner.kind]));
  const ownerPair = (left, right) => [left, right].sort().join("\u0000");
  const relationshipPairs = new Set(
    [...relationships.values()].map((relationship) =>
      ownerPair(relationship.provider, relationship.consumer),
    ),
  );
  for (const [name, entry] of Object.entries(modules)) {
    for (const dependency of entry.allowedWorkspaceDependencies ?? []) {
      const provider = modules[dependency];
      if (!provider || provider.semanticOwner === entry.semanticOwner) continue;
      if (ownerKinds.get(provider.semanticOwner) === "support-owner") continue;
      if (!relationshipPairs.has(ownerPair(provider.semanticOwner, entry.semanticOwner))) {
        errors.push(
          "Implementation topology module " +
            name +
            ": cross-owner dependency " +
            dependency +
            " (" +
            provider.semanticOwner +
            " <-> " +
            entry.semanticOwner +
            ") lacks explicit semantic relationship contract",
        );
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

async function exists(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function safeRelativeFilePath(path) {
  if (typeof path !== "string" || !path) return false;
  if (path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/.test(path)) return false;
  if (path.split("/").includes("..")) return false;
  return posix.normalize(path) === path;
}

export async function validateSemanticFilesystem(compiled, root) {
  const errors = [];
  const moduleByOwner = new Map();
  const exportsByModule = new Map();
  for (const [moduleName, entry] of Object.entries(compiled.topology.modules ?? {})) {
    moduleByOwner.set(entry.semanticOwner, { moduleName, ...entry });
    const packagePath = resolve(root, entry.path, "package.json");
    if (await exists(packagePath)) {
      const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
      exportsByModule.set(moduleName, new Set(Object.keys(packageJson.exports ?? {})));
    } else {
      exportsByModule.set(moduleName, new Set());
    }
  }

  for (const capability of compiled.capabilities.values()) {
    if (capability.kind !== "leaf") continue;
    const implementation = capability.implementation;
    if (!implementation) continue;
    const module = moduleByOwner.get(capability.owner);
    for (const path of implementation.sourcePaths ?? []) {
      if (!safeRelativeFilePath(path)) {
        errors.push(
          "Capability " + capability.id + ": sourcePath must be a normalized relative path",
        );
        continue;
      }
      if (!module || !path.startsWith(module.path + "/src/")) {
        errors.push("Capability " + capability.id + ": sourcePath must belong to owner module");
      }
      if (!(await exists(resolve(root, path)))) {
        errors.push("Capability " + capability.id + ": missing sourcePath " + path);
      }
    }
    for (const path of implementation.testPaths ?? []) {
      if (!safeRelativeFilePath(path)) {
        errors.push(
          "Capability " + capability.id + ": testPath must be a normalized relative path",
        );
        continue;
      }
      if (!(await exists(resolve(root, path)))) {
        errors.push("Capability " + capability.id + ": missing testPath " + path);
      }
    }
    for (const path of implementation.entrypoints ?? []) {
      if (!safeRelativeFilePath(path)) {
        errors.push(
          "Capability " + capability.id + ": entrypoint must be a normalized relative path",
        );
        continue;
      }
      if (!(await exists(resolve(root, path)))) {
        errors.push("Capability " + capability.id + ": missing entrypoint " + path);
      }
    }
    const publicExports = exportsByModule.get(module?.moduleName) ?? new Set();
    for (const key of implementation.publicExports ?? []) {
      if (!publicExports.has(key)) {
        errors.push("Capability " + capability.id + ": unknown public export " + key);
      }
    }
  }

  for (const locator of compiled.locators.values()) {
    for (const path of locator.routeFiles ?? []) {
      if (!safeRelativeFilePath(path)) {
        errors.push("Locator " + locator.id + ": routeFile must be a normalized relative path");
        continue;
      }
      if (!path.startsWith("apps/web/src/app/") || !path.endsWith("/page.tsx")) {
        errors.push("Locator " + locator.id + ": routeFile must be an app page.tsx");
      }
      if (!(await exists(resolve(root, path)))) {
        errors.push("Locator " + locator.id + ": missing routeFile " + path);
      }
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
  const locators = new Map((model.locators ?? []).map((item) => [item.id, item]));
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
    locators,
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
  const compiled = compileSemanticArchitecture(
    model,
    benchmark,
    topology,
    commandManifest,
    dataSources.dataTopology,
    dataSources.schemaFiles,
    dataSources.relationsByFile,
  );
  compiled.errors.push(...validateSemanticBenchmark(benchmark));
  compiled.errors.push(...(await validateSemanticFilesystem(compiled, root)));
  return compiled;
}
