function nodeMap(graph) {
  return new Map((graph.nodes ?? []).map((node) => [node.id, node]));
}

function edgeMap(graph) {
  return new Map(
    (graph.edges ?? []).map((edge) => [
      [edge.from, edge.type, edge.to, edge.attribute ?? ""].join("|"),
      edge,
    ]),
  );
}

function keyedMap(entries, key) {
  return new Map((entries ?? []).map((entry) => [entry[key], entry]));
}

function supplementalEvidenceMap(graph) {
  return new Map(
    (graph.supplementalEvidence ?? []).map((entry) => [
      [entry.kind, entry.repository, entry.revision, entry.path].join("|"),
      entry,
    ]),
  );
}

function changedEntries(before, after) {
  const removed = [];
  const added = [];
  const changed = [];
  for (const [id, value] of before) {
    if (!after.has(id)) removed.push(id);
    else if (JSON.stringify(value) !== JSON.stringify(after.get(id))) changed.push(id);
  }
  for (const id of after.keys()) {
    if (!before.has(id)) added.push(id);
  }
  return { added, removed, changed };
}

export function diffSemanticBenchmark(before, after, semanticModel) {
  const nodes = changedEntries(nodeMap(before), nodeMap(after));
  const edges = changedEntries(edgeMap(before), edgeMap(after));
  const sourceInventory = changedEntries(
    keyedMap(before.sourceInventory, "file"),
    keyedMap(after.sourceInventory, "file"),
  );
  const referenceContracts = changedEntries(
    keyedMap(before.referenceContracts, "id"),
    keyedMap(after.referenceContracts, "id"),
  );
  const projections = changedEntries(
    keyedMap(before.projections, "id"),
    keyedMap(after.projections, "id"),
  );
  const derivedResults = changedEntries(
    keyedMap(before.derivedResults, "id"),
    keyedMap(after.derivedResults, "id"),
  );
  const sourcePipeline = changedEntries(
    keyedMap(before.sourcePipeline, "id"),
    keyedMap(after.sourcePipeline, "id"),
  );
  const supplementalEvidence = changedEntries(
    supplementalEvidenceMap(before),
    supplementalEvidenceMap(after),
  );
  const adoptedNodes = new Set(
    (semanticModel.concepts ?? []).map((concept) => concept.benchmark?.node).filter(Boolean),
  );
  const adoptedBenchmarkDecisions = new Set(
    (semanticModel.benchmarkDecisions ?? [])
      .filter((decision) => decision.status === "adopted")
      .map((decision) => `${decision.kind}:${decision.id}`),
  );
  for (const decision of semanticModel.benchmarkDecisions ?? []) {
    if (decision.status === "adopted" && decision.kind === "node") adoptedNodes.add(decision.id);
  }
  const isAdoptedBenchmark = (kind, id) =>
    adoptedBenchmarkDecisions.has(`${kind}:${id}`) || (kind === "node" && adoptedNodes.has(id));
  const reviewRequired = [
    ...(before.authority?.revision !== after.authority?.revision
      ? [
          {
            type: "benchmark-revision-changed",
            id: `${before.authority?.revision ?? "unknown"}..${after.authority?.revision ?? "unknown"}`,
            breaking: false,
          },
        ]
      : []),
    ...sourceInventory.removed.map((id) => ({
      type: "source-inventory-removed",
      id,
      breaking: true,
    })),
    ...sourceInventory.added.map((id) => ({
      type: "source-inventory-added",
      id,
      breaking: false,
    })),
    ...sourceInventory.changed.map((id) => ({
      type: "source-inventory-changed",
      id,
      breaking: false,
    })),
    ...referenceContracts.removed.map((id) => ({
      type: "reference-contract-removed",
      id,
      breaking: isAdoptedBenchmark("reference-contract", id),
    })),
    ...referenceContracts.added.map((id) => ({
      type: "reference-contract-added",
      id,
      breaking: false,
    })),
    ...referenceContracts.changed.map((id) => ({
      type: "reference-contract-changed",
      id,
      breaking: false,
    })),
    ...projections.removed.map((id) => ({
      type: "projection-removed",
      id,
      breaking: isAdoptedBenchmark("projection", id),
    })),
    ...projections.added.map((id) => ({
      type: "projection-added",
      id,
      breaking: false,
    })),
    ...projections.changed.map((id) => ({
      type: "projection-changed",
      id,
      breaking: false,
    })),
    ...derivedResults.removed.map((id) => ({
      type: "derived-result-removed",
      id,
      breaking: isAdoptedBenchmark("derived-result", id),
    })),
    ...derivedResults.added.map((id) => ({
      type: "derived-result-added",
      id,
      breaking: false,
    })),
    ...derivedResults.changed.map((id) => ({
      type: "derived-result-changed",
      id,
      breaking: false,
    })),
    ...sourcePipeline.removed.map((id) => ({
      type: "source-pipeline-removed",
      id,
      breaking: false,
    })),
    ...sourcePipeline.added.map((id) => ({
      type: "source-pipeline-added",
      id,
      breaking: false,
    })),
    ...sourcePipeline.changed.map((id) => ({
      type: "source-pipeline-changed",
      id,
      breaking: false,
    })),
    ...supplementalEvidence.removed.map((id) => ({
      type: "supplemental-evidence-removed",
      id,
      breaking: false,
    })),
    ...supplementalEvidence.added.map((id) => ({
      type: "supplemental-evidence-added",
      id,
      breaking: false,
    })),
    ...supplementalEvidence.changed.map((id) => ({
      type: "supplemental-evidence-changed",
      id,
      breaking: false,
    })),
    ...nodes.removed
      .filter((id) => isAdoptedBenchmark("node", id))
      .map((id) => ({ type: "adopted-node-removed", id, breaking: true })),
    ...nodes.changed
      .filter((id) => isAdoptedBenchmark("node", id))
      .map((id) => ({ type: "adopted-node-changed", id, breaking: false })),
    ...edges.removed
      .filter((key) => {
        const [from, , to] = key.split("|");
        return isAdoptedBenchmark("node", from) && isAdoptedBenchmark("node", to);
      })
      .map((id) => ({ type: "adopted-relationship-removed", id, breaking: true })),
    ...edges.changed
      .filter((key) => {
        const [from, , to] = key.split("|");
        return isAdoptedBenchmark("node", from) && isAdoptedBenchmark("node", to);
      })
      .map((id) => ({ type: "adopted-relationship-changed", id, breaking: false })),
  ];

  return {
    beforeRevision: before.authority?.revision ?? null,
    afterRevision: after.authority?.revision ?? null,
    sourceInventory,
    referenceContracts,
    projections,
    derivedResults,
    sourcePipeline,
    supplementalEvidence,
    nodes,
    edges,
    adoptedNodes: [...adoptedNodes].sort(),
    reviewRequired,
  };
}
