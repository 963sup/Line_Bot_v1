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
  const adoptedNodes = new Set(
    (semanticModel.concepts ?? []).map((concept) => concept.benchmark?.node).filter(Boolean),
  );
  const reviewRequired = [
    ...nodes.removed
      .filter((id) => adoptedNodes.has(id))
      .map((id) => ({ type: "adopted-node-removed", id, breaking: true })),
    ...nodes.changed
      .filter((id) => adoptedNodes.has(id))
      .map((id) => ({ type: "adopted-node-changed", id, breaking: false })),
    ...edges.removed
      .filter((key) => {
        const [from, , to] = key.split("|");
        return adoptedNodes.has(from) && adoptedNodes.has(to);
      })
      .map((id) => ({ type: "adopted-relationship-removed", id, breaking: true })),
    ...edges.changed
      .filter((key) => {
        const [from, , to] = key.split("|");
        return adoptedNodes.has(from) && adoptedNodes.has(to);
      })
      .map((id) => ({ type: "adopted-relationship-changed", id, breaking: false })),
  ];

  return {
    beforeRevision: before.authority?.revision ?? null,
    afterRevision: after.authority?.revision ?? null,
    nodes,
    edges,
    adoptedNodes: [...adoptedNodes].sort(),
    reviewRequired,
  };
}
