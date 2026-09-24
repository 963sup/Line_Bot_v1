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
  const concept = compiled.concepts.get(id);
  const ownerId = concept?.owner ?? (compiled.owners.has(id) ? id : null);
  if (!ownerId) return null;
  const concepts = concept
    ? [concept]
    : [...compiled.concepts.values()].filter((candidate) => candidate.owner === ownerId);
  const benchmark = concepts
    .filter((candidate) => candidate.benchmark?.node)
    .map((candidate) => ({
      concept: candidate.id,
      adoption: candidate.benchmark.adoption,
      benchmark: compiled.benchmarkNodes.get(candidate.benchmark.node) ?? null,
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
    benchmark,
    validation: [...profiles.values()],
    evidenceRule: compiled.model.evidenceModel?.scopeRule ?? null,
    truthRegistry: compiled.model.truthRegistry,
  };
}

function explain(compiled, id) {
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

export function querySemanticArchitecture(compiled, command, args) {
  if (compiled.errors.length) {
    throw new Error("Semantic architecture is invalid:\n" + compiled.errors.join("\n"));
  }

  const id = args[0];
  if (command === "owner") return compiled.owners.get(id) ?? null;
  if (command === "concept") return compiled.concepts.get(id) ?? null;
  if (command === "benchmark") return compiled.benchmarkNodes.get(id) ?? null;
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
  if (command === "explain") return explain(compiled, id);

  throw new Error(
    "Usage: pnpm semantic <owner|concept|benchmark|resolve|neighbors|path|impact|contracts|consumers|dependencies|invariants|boundaries|evidence|truth|explain> <id|intent> [to]",
  );
}
