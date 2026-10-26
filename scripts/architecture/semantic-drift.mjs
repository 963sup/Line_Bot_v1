function fileMap(manifest) {
  return new Map((manifest?.files ?? []).map((entry) => [entry.name, entry.gitBlobSha]));
}

function references(model) {
  return new Set([
    ...(model?.concepts ?? []).map((concept) => concept.fpt?.file).filter(Boolean),
    ...(model?.locators ?? []).map((locator) => locator.fpt?.file).filter(Boolean),
  ]);
}

export function diffFptDomainTruth(before, after, semanticModel) {
  const left = fileMap(before);
  const right = fileMap(after);
  const referenced = references(semanticModel);
  const added = [];
  const removed = [];
  const changed = [];

  for (const [name, sha] of left) {
    if (!right.has(name)) removed.push(name);
    else if (right.get(name) !== sha) changed.push(name);
  }
  for (const name of right.keys()) if (!left.has(name)) added.push(name);

  const reviewRequired = [
    ...(before?.upstream?.revision !== after?.upstream?.revision
      ? [
          {
            type: "fpt-revision-changed",
            id: `${before?.upstream?.revision ?? "unknown"}..${after?.upstream?.revision ?? "unknown"}`,
            breaking: false,
          },
        ]
      : []),
    ...removed.map((id) => ({ type: "fpt-file-removed", id, breaking: referenced.has(id) })),
    ...changed.map((id) => ({ type: "fpt-file-changed", id, breaking: referenced.has(id) })),
    ...added.map((id) => ({ type: "fpt-file-added", id, breaking: false })),
  ];

  return {
    beforeRevision: before?.upstream?.revision ?? null,
    afterRevision: after?.upstream?.revision ?? null,
    files: { added, removed, changed },
    referencedFiles: [...referenced].sort(),
    reviewRequired,
  };
}
