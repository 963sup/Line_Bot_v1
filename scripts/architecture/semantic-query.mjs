import { resolveFptReference } from "./fpt-domain-core.mjs";
import { boundarySnapshot, buildOwnerImpact, resolveSemanticIntent } from "./semantic-planning.mjs";

function bfsPath(adjacency, from, to) {
  if (from === to) return [from];
  const queue = [[from]];
  const visited = new Set([from]);
  while (queue.length) {
    const path = queue.shift();
    const current = path.at(-1);
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      const candidate = [...path, next];
      if (next === to) return candidate;
      visited.add(next);
      queue.push(candidate);
    }
  }
  return null;
}

function ownerCapabilities(compiled, ownerId) {
  return [...compiled.capabilities.values()].filter((capability) => capability.owner === ownerId);
}

function capabilityEvidence(compiled, capability) {
  if (!capability) return null;
  return {
    capability,
    owner: compiled.owners.get(capability.owner) ?? null,
    implementation: capability.implementation ?? null,
    members: (capability.members ?? []).map((id) => compiled.capabilities.get(id)).filter(Boolean),
    validation: (capability.validationProfiles ?? [])
      .map((id) => compiled.validationProfiles.get(id))
      .filter(Boolean),
    evidenceRule: compiled.model.evidenceModel?.scopeRule ?? null,
  };
}

function ownerInvariants(compiled, ownerId) {
  const ids = new Set(
    ownerCapabilities(compiled, ownerId).flatMap((capability) => capability.preserves ?? []),
  );
  for (const invariant of compiled.invariants.values()) {
    if (invariant.id.startsWith("SA")) ids.add(invariant.id);
  }
  return [...ids].map((id) => compiled.invariants.get(id)).filter(Boolean);
}

function contractsFor(compiled, ownerId) {
  if (!compiled.owners.has(ownerId)) return null;
  return [...compiled.relationships.values()].filter(
    (relationship) => relationship.provider === ownerId || relationship.consumer === ownerId,
  );
}

function evidenceFor(compiled, id) {
  if (compiled.capabilities.has(id))
    return capabilityEvidence(compiled, compiled.capabilities.get(id));
  const concept = compiled.concepts.get(id);
  const ownerId = concept?.owner ?? (compiled.owners.has(id) ? id : null);
  if (!ownerId) return null;
  const concepts = concept
    ? [concept]
    : [...compiled.concepts.values()].filter((candidate) => candidate.owner === ownerId);
  const fpt = concepts
    .filter((candidate) => candidate.fpt)
    .map((candidate) => ({
      concept: candidate.id,
      reference: candidate.fpt,
      resolved: resolveFptReference(compiled.fpt, candidate.fpt),
    }));
  const profiles = new Map();
  for (const capability of ownerCapabilities(compiled, ownerId)) {
    for (const profileId of capability.validationProfiles ?? []) {
      const profile = compiled.validationProfiles.get(profileId);
      if (profile) profiles.set(profile.id, profile);
    }
  }
  return {
    owner: compiled.owners.get(ownerId),
    capabilities: ownerCapabilities(compiled, ownerId).map((capability) =>
      capabilityEvidence(compiled, capability),
    ),
    fpt,
    validation: [...profiles.values()],
    evidenceRule: compiled.model.evidenceModel?.scopeRule ?? null,
    truthRegistry: compiled.model.truthRegistry,
  };
}

function explain(compiled, id) {
  if (compiled.capabilities.has(id)) {
    const evidence = capabilityEvidence(compiled, compiled.capabilities.get(id));
    return {
      capability: evidence.capability,
      owner: evidence.owner,
      implementation: evidence.implementation,
      members: evidence.members,
      boundaries: boundarySnapshot(compiled, [evidence.capability.owner]),
      invariants: (evidence.capability.preserves ?? [])
        .map((invariantId) => compiled.invariants.get(invariantId))
        .filter(Boolean),
      evidence,
    };
  }
  const concept = compiled.concepts.get(id);
  const ownerId = concept?.owner ?? (compiled.owners.has(id) ? id : null);
  if (!ownerId) return null;
  return {
    concept: concept ?? null,
    owner: compiled.owners.get(ownerId),
    impact: buildOwnerImpact(compiled, ownerId),
    boundaries: boundarySnapshot(compiled, [ownerId]),
    contracts: contractsFor(compiled, ownerId),
    invariants: ownerInvariants(compiled, ownerId),
    evidence: evidenceFor(compiled, id),
  };
}

function fptCoverage(compiled) {
  const referencesByFile = new Map();
  const addReference = (type, id, fpt) => {
    const references = referencesByFile.get(fpt.file) ?? [];
    references.push({
      type,
      id,
      symbol: fpt.symbol,
      ...(fpt.field ? { field: fpt.field } : {}),
    });
    referencesByFile.set(fpt.file, references);
  };

  for (const concept of compiled.concepts.values()) {
    if (concept.fpt) addReference("concept", concept.id, concept.fpt);
  }
  for (const locator of compiled.locators.values()) {
    if (locator.fpt) addReference("locator", locator.id, locator.fpt);
  }

  const schemaFiles = (compiled.fpt.manifest.files ?? [])
    .map((entry) => entry.name)
    .filter((name) => name.startsWith("schema-") && name.endsWith(".json"))
    .map((file) => {
      const prefix = file + ":";
      const references = (referencesByFile.get(file) ?? []).sort(
        (left, right) => left.type.localeCompare(right.type) || left.id.localeCompare(right.id),
      );
      return {
        file,
        symbolCount: [...compiled.fpt.symbols.keys()].filter((key) => key.startsWith(prefix))
          .length,
        references,
      };
    });

  return {
    revision: compiled.fpt.manifest.upstream.revision,
    schemaFiles,
    referencedSchemaFiles: schemaFiles
      .filter((entry) => entry.references.length > 0)
      .map((entry) => entry.file),
    unreferencedSchemaFiles: schemaFiles
      .filter((entry) => entry.references.length === 0)
      .map((entry) => entry.file),
  };
}

export function querySemanticArchitecture(compiled, command, args) {
  if (compiled.errors.length) {
    throw new Error("Semantic architecture is invalid:\n" + compiled.errors.join("\n"));
  }

  const id = args[0];
  if (command === "owner") return compiled.owners.get(id) ?? null;
  if (command === "concept") return compiled.concepts.get(id) ?? null;
  if (command === "capability") return compiled.capabilities.get(id) ?? null;
  if (command === "fpt") {
    const [file, symbol, field] = args;
    return resolveFptReference(compiled.fpt, { file, symbol, ...(field ? { field } : {}) });
  }
  if (command === "resolve") return resolveSemanticIntent(compiled, args.join(" "));
  if (command === "neighbors") {
    if (!compiled.owners.has(id)) return null;
    return {
      owner: id,
      neighbors: [...(compiled.adjacency.get(id) ?? [])].sort(),
      relationships: contractsFor(compiled, id),
    };
  }
  if (command === "path") {
    const to = args[1];
    if (!compiled.owners.has(id) || !compiled.owners.has(to)) return null;
    return bfsPath(compiled.adjacency, id, to);
  }
  if (command === "impact") return buildOwnerImpact(compiled, id);
  if (command === "contracts") return contractsFor(compiled, id);
  if (command === "consumers") {
    if (!compiled.owners.has(id)) return null;
    return [...compiled.relationships.values()].filter(
      (relationship) => relationship.provider === id,
    );
  }
  if (command === "dependencies") {
    if (!compiled.owners.has(id)) return null;
    return [...compiled.relationships.values()].filter(
      (relationship) => relationship.consumer === id,
    );
  }
  if (command === "invariants") {
    if (!compiled.owners.has(id)) return null;
    return ownerInvariants(compiled, id);
  }
  if (command === "boundaries") {
    if (!compiled.owners.has(id)) return null;
    return boundarySnapshot(compiled, [id]);
  }
  if (command === "evidence") return evidenceFor(compiled, id);
  if (command === "truth") {
    return (compiled.model.truthRegistry ?? []).find((entry) => entry.id === id) ?? null;
  }
  if (command === "locators") return [...compiled.locators.values()];
  if (command === "fpt-references") {
    return {
      revision: compiled.fpt.manifest.upstream.revision,
      concepts: [...compiled.concepts.values()]
        .filter((concept) => concept.fpt)
        .map((concept) => ({ concept: concept.id, fpt: concept.fpt })),
      locators: [...compiled.locators.values()]
        .filter((locator) => locator.fpt)
        .map((locator) => ({ locator: locator.id, fpt: locator.fpt })),
    };
  }
  if (command === "fpt-coverage") return fptCoverage(compiled);
  if (command === "explain") return explain(compiled, id);

  throw new Error(
    "Usage: pnpm semantic <owner|concept|capability|fpt|resolve|neighbors|path|impact|contracts|consumers|dependencies|invariants|boundaries|evidence|truth|locators|fpt-references|fpt-coverage|explain> <id|intent> [to]",
  );
}
