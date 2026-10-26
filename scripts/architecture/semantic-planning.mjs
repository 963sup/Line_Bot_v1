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

function matchesTerm(intent, term) {
  if (!term) return false;
  const word = /[\p{Script=Latin}\p{N}]/u;
  for (let at = intent.indexOf(term); at !== -1; at = intent.indexOf(term, at + 1)) {
    const end = at + term.length;
    if (
      !(at > 0 && word.test(term[0]) && word.test(intent[at - 1])) &&
      !(end < intent.length && word.test(term.at(-1)) && word.test(intent[end]))
    ) {
      return true;
    }
  }
  return false;
}

export function resolveSemanticIntent(compiled, intent) {
  const selector = String(intent ?? "")
    .trim()
    .match(/^(owner|concept|capability):\s*(.+)$/iu);
  const normalizedIntent = normalize(selector?.[2] ?? intent);
  const definitions = [
    ...[...compiled.owners.values()].map((item) => ({
      kind: "owner",
      item,
      owner: item.id,
      terms: [item.id, item.name],
      source: "architecture/semantic-model.json#semanticOwners",
    })),
    ...[...compiled.concepts.values()].map((item) => ({
      kind: "concept",
      item,
      owner: item.owner,
      terms: [item.id, item.fpt?.symbol ?? item.canonicalName, ...(item.aliases ?? [])],
      source: item.fpt
        ? `architecture/domain/fpt/${item.fpt.file}#${item.fpt.symbol}`
        : "architecture/semantic-model.json#concepts",
    })),
    ...[...compiled.capabilities.values()].map((item) => ({
      kind: "capability",
      item,
      owner: item.owner,
      terms: [item.id],
      source: "architecture/semantic-model.json#capabilities",
    })),
  ].filter((entry) => !selector || entry.kind === selector[1].toLowerCase());
  const exact = definitions.filter((entry) => normalize(entry.item.id) === normalizedIntent);
  const matches = (exact.length ? exact : selector ? [] : definitions).flatMap((entry) =>
    [...new Set((exact.length ? [entry.item.id] : entry.terms).filter(Boolean).map(normalize))]
      .filter((term) => exact.length || matchesTerm(normalizedIntent, term))
      .map((term) => ({
        kind: entry.kind,
        id: entry.item.id,
        owner: entry.owner,
        term,
        source:
          term === normalize(entry.item.id)
            ? `architecture/semantic-model.json#${entry.kind === "owner" ? "semanticOwners" : `${entry.kind}s`}`
            : entry.source,
        reason: exact.length ? "exact-id" : "bounded-term",
      })),
  );
  const byTerm = new Map();
  for (const match of matches) {
    if (!byTerm.has(match.term)) byTerm.set(match.term, []);
    byTerm.get(match.term).push(match);
  }
  const ambiguities = [...byTerm].flatMap(([term, entries]) => {
    const concepts = [...new Set(entries.filter((m) => m.kind === "concept").map((m) => m.id))];
    const owners = [...new Set(entries.map((m) => m.owner))];
    return concepts.length > 1 || owners.length > 1 ? [{ term, concepts, owners }] : [];
  });
  const ambiguousTerms = new Set(ambiguities.map((entry) => entry.term));
  const selected = matches.filter((match) => !ambiguousTerms.has(match.term));
  const candidates = matches.filter((match) => ambiguousTerms.has(match.term));
  if (!matches.length && normalizedIntent.length >= 3 && !normalizedIntent.includes(" ")) {
    for (const entry of definitions) {
      if (normalize(entry.item.id).startsWith(normalizedIntent)) {
        candidates.push({
          kind: entry.kind,
          id: entry.item.id,
          owner: entry.owner,
          term: normalize(entry.item.id),
          source: "architecture/semantic-model.json",
          reason: "prefix-candidate",
        });
      }
    }
  }
  const concepts = uniqueById(
    selected
      .filter((match) => match.kind === "concept")
      .map((match) => compiled.concepts.get(match.id)),
  );
  const owners = uniqueById(
    selected.map((match) => compiled.owners.get(match.owner)).filter(Boolean),
  );

  return {
    intent,
    normalizedIntent,
    status: ambiguities.length
      ? "ambiguous"
      : owners.length
        ? "resolved"
        : candidates.length
          ? "candidate"
          : "no-match",
    concepts,
    owners,
    currentOwners: owners.filter((owner) => owner.lifecycle !== "selected-target"),
    targetOwners: owners.filter((owner) => owner.lifecycle === "selected-target"),
    matches,
    candidates,
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
    subdomains: [...compiled.subdomains.values()].filter((subdomain) =>
      subdomain.owners.some((owner) => owners.has(owner)),
    ),
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
    primaryCurrentOwners: resolution.currentOwners.map((owner) => owner.id),
    primaryTargetOwners: resolution.targetOwners.map((owner) => owner.id),
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
        "github-fpt-domain-truth",
      ].includes(entry.id),
    ),
    requiredValidation: validationProfiles(compiled, capabilities),
    expectedEvidenceRule: compiled.model.evidenceModel?.scopeRule ?? null,
  };
}

export function compileAgentContext(compiled, intent, { task = "source" } = {}) {
  if (!["docs", "source", "schema"].includes(task))
    throw new Error(`Unknown context task: ${task}`);
  const plan = planSemanticChange(compiled, intent);
  const ownerSet = new Set([...plan.primaryOwners, ...plan.directImpactOwners]);
  const concepts = [...compiled.concepts.values()].filter((concept) => ownerSet.has(concept.owner));
  const fptEvidence = concepts
    .filter((concept) => concept.fpt)
    .map((concept) => ({
      concept: concept.id,
      reference: concept.fpt,
      revision: compiled.fpt.manifest.upstream.revision,
    }));
  const required = new Map();
  const add = (path, reason, selector) => {
    if (!required.has(path)) required.set(path, { path, reasons: [], selectors: [] });
    const entry = required.get(path);
    if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
    if (selector) entry.selectors.push(selector);
  };
  add("AGENTS.md", "Complete governing authority and effective context contract");
  add("docs/README.md", "Task routing");
  add("docs/rules/system-invariants.md", "Global invariants always apply");
  if (task === "docs")
    add(
      "docs/AGENTS.md",
      "Documentation constraints; also read nearest AGENTS for the actual target",
    );
  else {
    add("architecture/README.md", "Canonical authority routing");
    add("architecture/semantic-model.json", "Affected semantic owners, invariants and contracts", {
      owners: plan.primaryOwners,
    });
    add("architecture/implementation-topology.json", "Affected module kinds and dependencies", {
      owners: plan.primaryOwners,
    });
    for (const path of [".dependency-cruiser.mjs", "biome.json", "knip.jsonc"])
      add(path, "Source dependency, formatting and reachability constraints");
  }
  for (const ownerId of plan.primaryOwners) {
    const owner = compiled.owners.get(ownerId);
    if (owner.doc) add(owner.doc, `Primary Owner ${ownerId}`);
    const mapping = compiled.mappings.get(ownerId);
    const module = compiled.topology.modules?.[mapping?.module];
    if (module) {
      add(`${module.path.split("/")[0]}/AGENTS.md`, `Parent constraints for ${ownerId}`);
      add(
        `${module.path}/AGENTS.md`,
        `Local constraints for ${ownerId}; descend to the actual target`,
      );
      add(`${module.path}/package.json`, `Exact public exports for ${ownerId}`);
    }
    if (task !== "docs") {
      for (const evidence of fptEvidence.filter(
        (entry) =>
          compiled.concepts.get(entry.concept).owner === ownerId &&
          (!plan.resolution.concepts.length ||
            plan.resolution.concepts.some((concept) => concept.id === entry.concept)),
      )) {
        add(
          `architecture/domain/fpt/${evidence.reference.file}`,
          `GitHub meaning for ${evidence.concept}`,
          evidence.reference,
        );
        add("architecture/domain/fpt-source.json", "Pinned upstream revision and integrity");
      }
      for (const target of Object.values(compiled.topology.targetModules ?? {}).filter(
        (entry) => entry.semanticOwner === ownerId,
      )) {
        for (const reference of target.fptRoots ?? []) {
          add(
            `architecture/domain/fpt/${reference.file}`,
            `Explicit selected-target ${ownerId}; no runtime promotion`,
            reference,
          );
          add("architecture/domain/fpt-source.json", "Pinned upstream revision and integrity");
        }
      }
    }
  }
  if (task === "schema") {
    add(
      "architecture/data-topology.json",
      "Affected relation authority and cross-owner participants",
      { owners: plan.primaryOwners },
    );
    add("supabase/AGENTS.md", "Database scope constraints");
    add("packages/integration-supabase/src/schemas/AGENTS.md", "Declarative schema constraints");
    add("docs/rules/database-writes.md", "Atomicity, replay and recovery");
    add("docs/rules/request-authorization.md", "Current qualification and isolation");
    for (const surface of plan.candidateChangeSurfaces.filter(
      (entry) => entry.tier === "primary",
    )) {
      for (const data of surface.data)
        add(data.path, `Persistence/participants for ${surface.owner}`);
    }
  }
  const unresolved =
    task !== "docs" && plan.resolution.status !== "resolved"
      ? [
          {
            kind: "owner-resolution",
            status: plan.resolution.status,
            candidates: plan.resolution.candidates,
          },
        ]
      : [];

  return {
    intent,
    status: plan.resolution.status,
    resolution: plan.resolution,
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
    validation:
      task === "docs"
        ? [compiled.validationProfiles.get("docs")].filter(Boolean)
        : plan.requiredValidation,
    evidenceRule: plan.expectedEvidenceRule,
    fptEvidence,
    reading: {
      authority: "AGENTS.md#effective-context-contract",
      task,
      required: [...required.values()],
      review: plan.candidateChangeSurfaces
        .filter((surface) => surface.tier !== "primary")
        .map((surface) => ({
          owner: surface.owner,
          path: surface.ownerDoc,
          tier: surface.tier,
          reason:
            "Expand when this provider/consumer contract, qualification or persistence flow is affected",
        })),
      unresolved,
      fallback: unresolved.length
        ? "Read the complete Mandatory governing set from AGENTS.md and resolve scope before implementation."
        : null,
    },
  };
}
