function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueById(items) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function conceptSearchTerms(concept) {
  return uniqueById(
    [concept.id, concept.canonicalName, ...(concept.aliases ?? [])]
      .filter(Boolean)
      .map((value) => ({ id: normalize(value), value: normalize(value) })),
  ).map((entry) => entry.value);
}

export function resolveSemanticIntent(compiled, intent) {
  const normalizedIntent = normalize(intent);
  const matchedConcepts = [];
  const matchedOwners = [];

  for (const concept of compiled.concepts.values()) {
    if (conceptSearchTerms(concept).some((term) => term && normalizedIntent.includes(term))) {
      matchedConcepts.push(concept);
    }
  }
  for (const owner of compiled.owners.values()) {
    const terms = [owner.id, owner.name].filter(Boolean).map(normalize);
    if (terms.some((term) => term && normalizedIntent.includes(term))) matchedOwners.push(owner);
  }
  for (const concept of matchedConcepts) {
    const owner = compiled.owners.get(concept.owner);
    if (owner) matchedOwners.push(owner);
  }

  const concepts = uniqueById(matchedConcepts);
  const owners = uniqueById(matchedOwners);
  const byCanonicalName = new Map();
  for (const concept of concepts) {
    const key = normalize(concept.canonicalName);
    if (!byCanonicalName.has(key)) byCanonicalName.set(key, []);
    byCanonicalName.get(key).push(concept.id);
  }
  const ambiguities = [...byCanonicalName.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([term, ids]) => ({ term, concepts: ids }));

  return {
    intent,
    normalizedIntent,
    status:
      concepts.length || owners.length
        ? ambiguities.length
          ? "ambiguous"
          : "resolved"
        : "no-match",
    concepts,
    owners,
    ambiguities,
  };
}

export function buildOwnerImpact(compiled, ownerId, maxDepth = 2) {
  if (!compiled.owners.has(ownerId)) return null;
  const queue = [{ owner: ownerId, depth: 0, path: [ownerId] }];
  const visited = new Map([[ownerId, { depth: 0, path: [ownerId] }]]);

  while (queue.length) {
    const current = queue.shift();
    if (current.depth >= maxDepth) continue;
    for (const next of compiled.adjacency.get(current.owner) ?? []) {
      if (visited.has(next)) continue;
      const value = { depth: current.depth + 1, path: [...current.path, next] };
      visited.set(next, value);
      queue.push({ owner: next, ...value });
    }
  }

  const direct = [...visited.entries()]
    .filter(([, value]) => value.depth === 1)
    .map(([owner, value]) => ({ owner, path: value.path }));
  const transitive = [...visited.entries()]
    .filter(([, value]) => value.depth > 1)
    .map(([owner, value]) => ({ owner, depth: value.depth, path: value.path }));
  const relationships = [...compiled.relationships.values()].filter(
    (relationship) => relationship.provider === ownerId || relationship.consumer === ownerId,
  );

  return {
    owner: compiled.owners.get(ownerId),
    concepts: [...compiled.concepts.values()].filter((concept) => concept.owner === ownerId),
    direct,
    transitive,
    relationships,
    implementation: compiled.mappings.get(ownerId) ?? null,
    data: compiled.dataByOwner.get(ownerId) ?? [],
  };
}

export function boundarySnapshot(compiled, ownerIds) {
  const owners = new Set(ownerIds);
  const contexts = (compiled.model.boundedContexts ?? []).filter((context) => {
    const contextOwners = context.owners ?? (context.owner ? [context.owner] : []);
    return contextOwners.some((owner) => owners.has(owner));
  });
  const implementation = ownerIds.map((owner) => compiled.mappings.get(owner)).filter(Boolean);
  const moduleNames = new Set(implementation.map((mapping) => mapping.module).filter(Boolean));
  const runtime = Object.entries(compiled.topology.applications ?? {})
    .filter(([, app]) =>
      (app.allowedWorkspaceDependencies ?? []).some((dependency) => moduleNames.has(dependency)),
    )
    .map(([name, app]) => ({ name, path: app.path }));
  const trust = [...compiled.concepts.values()].filter(
    (concept) => owners.has(concept.owner) && concept.kind === "external-proof",
  );
  const transactionalContracts = [...compiled.relationships.values()].filter(
    (relationship) =>
      (owners.has(relationship.provider) || owners.has(relationship.consumer)) &&
      /atomic|transaction/i.test(relationship.consistency ?? ""),
  );

  return {
    semantic: contexts,
    module: implementation.map((mapping) => ({
      owner: mapping.semanticOwner,
      module: mapping.module ?? null,
    })),
    data: [
      ...new Map(
        ownerIds
          .flatMap((owner) => compiled.dataByOwner.get(owner) ?? [])
          .map((surface) => [surface.path + ":" + surface.relation, surface]),
      ).values(),
    ],
    consistency: [...compiled.invariants.values()].filter((invariant) =>
      (invariant.tags ?? []).some((tag) =>
        ["concurrency", "replay", "transaction", "recovery"].includes(tag),
      ),
    ),
    transaction: transactionalContracts,
    trust,
    runtime,
  };
}

function relevantInvariants(compiled, capabilities) {
  const ids = new Set(capabilities.flatMap((capability) => capability.preserves ?? []));
  for (const invariant of compiled.invariants.values()) {
    if (invariant.id.startsWith("SA")) ids.add(invariant.id);
  }
  return [...ids].map((id) => compiled.invariants.get(id)).filter(Boolean);
}

function validationProfiles(compiled, capabilities) {
  const ids = new Set(["semantic-architecture", "architecture-tests", "fast-repository"]);
  for (const capability of capabilities) {
    for (const profile of capability.validationProfiles ?? []) ids.add(profile);
  }
  return [...ids].map((id) => compiled.validationProfiles.get(id)).filter(Boolean);
}

export function planSemanticChange(compiled, intent) {
  if (compiled.errors.length) {
    throw new Error("Semantic architecture is invalid:\n" + compiled.errors.join("\n"));
  }
  const resolution = resolveSemanticIntent(compiled, intent);
  const primaryOwners = resolution.owners.map((owner) => owner.id);
  const directOwners = new Set();
  const transitiveOwners = new Map();
  for (const owner of primaryOwners) {
    const impact = buildOwnerImpact(compiled, owner);
    for (const entry of impact?.direct ?? []) directOwners.add(entry.owner);
    for (const entry of impact?.transitive ?? []) {
      if (!transitiveOwners.has(entry.owner)) transitiveOwners.set(entry.owner, entry);
    }
  }
  for (const owner of primaryOwners) {
    directOwners.delete(owner);
    transitiveOwners.delete(owner);
  }
  for (const owner of directOwners) transitiveOwners.delete(owner);

  const reviewOwners = [
    ...new Set([...primaryOwners, ...directOwners, ...transitiveOwners.keys()]),
  ];
  const capabilities = [...compiled.capabilities.values()].filter((capability) =>
    primaryOwners.includes(capability.owner),
  );
  const invariants = relevantInvariants(compiled, capabilities);
  const contracts = [...compiled.relationships.values()].filter(
    (relationship) =>
      primaryOwners.includes(relationship.provider) ||
      primaryOwners.includes(relationship.consumer) ||
      directOwners.has(relationship.provider) ||
      directOwners.has(relationship.consumer),
  );
  const surfaces = reviewOwners.map((owner) => ({
    owner,
    tier: primaryOwners.includes(owner)
      ? "primary"
      : directOwners.has(owner)
        ? "direct-review"
        : "transitive-review-only",
    ownerDoc: compiled.owners.get(owner)?.doc ?? null,
    implementation: compiled.mappings.get(owner) ?? null,
    data: compiled.dataByOwner.get(owner) ?? [],
  }));
  const securityConcerns = invariants.filter((invariant) =>
    (invariant.tags ?? []).some((tag) => ["security", "authorization", "trust"].includes(tag)),
  );

  return {
    intent,
    resolution,
    primaryOwners,
    directImpactOwners: [...directOwners].sort(),
    transitiveReviewOwners: [...transitiveOwners.values()].sort(
      (a, b) => a.depth - b.depth || a.owner.localeCompare(b.owner),
    ),
    contracts,
    capabilities,
    invariants,
    affectedBoundaries: boundarySnapshot(compiled, reviewOwners),
    candidateChangeSurfaces: surfaces,
    securityConcerns,
    authoritativeTruth: (compiled.model.truthRegistry ?? []).filter((entry) =>
      [
        "business-definition",
        "owner-local-business-rules",
        "module-topology",
        "public-contract",
        "persistence-current-state",
        "data-topology",
        "external-semantic-benchmark",
      ].includes(entry.id),
    ),
    requiredValidation: validationProfiles(compiled, capabilities),
    expectedEvidenceRule: compiled.model.evidenceModel?.scopeRule ?? null,
  };
}

export function compileAgentContext(compiled, intent) {
  const plan = planSemanticChange(compiled, intent);
  const ownerSet = new Set([...plan.primaryOwners, ...plan.directImpactOwners]);
  const concepts = [...compiled.concepts.values()].filter((concept) => ownerSet.has(concept.owner));
  const benchmarkEvidence = concepts
    .filter((concept) => concept.benchmark?.node)
    .map((concept) => {
      const node = compiled.benchmarkNodes.get(concept.benchmark.node);
      return {
        concept: concept.id,
        benchmarkNode: concept.benchmark.node,
        adoption: concept.benchmark.adoption,
        source: node?.source ?? null,
      };
    });

  return {
    intent,
    status: plan.resolution.status,
    ambiguities: plan.resolution.ambiguities,
    concepts,
    owners: [...ownerSet].map((id) => compiled.owners.get(id)).filter(Boolean),
    contracts: plan.contracts,
    boundaries: plan.affectedBoundaries,
    invariants: plan.invariants,
    files: plan.candidateChangeSurfaces
      .filter((surface) => surface.tier !== "transitive-review-only")
      .map((surface) => ({
        owner: surface.owner,
        doc: surface.ownerDoc,
        module: surface.implementation?.module ?? null,
        data: surface.data ?? [],
      })),
    validation: plan.requiredValidation,
    evidenceRule: plan.expectedEvidenceRule,
    benchmarkEvidence,
  };
}
