function keyed(items, label) {
  return new Map(
    (items ?? []).map((item) => [
      label === "benchmarkDecisions" ? `${item.kind}:${item.id}` : (item.id ?? item.semanticOwner),
      item,
    ]),
  );
}

function propertyChanges(before, after) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));
}

function classifyChanged(label, before, after) {
  const properties = propertyChanges(before, after);
  let classification = label.slice(0, -1) + "-change";
  let breaking = false;

  if (label === "concepts") {
    if (properties.includes("owner")) {
      classification = "ownership-change";
      breaking = true;
    } else if (properties.includes("authorityMode") || properties.includes("kind")) {
      classification = "authority-change";
      breaking = true;
    } else if (properties.includes("canonicalName")) {
      classification = "vocabulary-rename";
      breaking = true;
    } else if (properties.includes("definition")) {
      classification = "definition-change";
    } else if (properties.includes("lifecycle")) {
      classification = "lifecycle-change";
    }
  } else if (label === "relationships") {
    classification = "contract-change";
    breaking = properties.some((property) =>
      ["provider", "consumer", "authority", "integrationMode"].includes(property),
    );
  } else if (label === "boundedContexts" || label === "boundaryTypes") {
    classification = "boundary-change";
    breaking = true;
  } else if (label === "invariants") {
    classification = "invariant-change";
    breaking = true;
  } else if (label === "policies") {
    classification = "policy-change";
    breaking = true;
  } else if (label === "truthRegistry") {
    classification = "authority-source-change";
    breaking = properties.includes("authority");
  } else if (label === "implementationMappings") {
    classification = "implementation-mapping-change";
    breaking = properties.some((property) => ["module", "data"].includes(property));
  } else if (label === "validationProfiles" || label === "evidenceClasses") {
    classification = "evidence-contract-change";
  } else if (label === "conceptTypes" || label === "integrationModes") {
    classification = "semantic-type-change";
    breaking = true;
  } else if (label === "capabilities") {
    classification = "capability-change";
    breaking =
      properties.some((property) =>
        ["owner", "kind", "members", "runtimeExpectation", "implementation"].includes(property),
      ) ||
      ["preserves", "validationProfiles"].some((property) =>
        (before[property] ?? []).some((id) => !(after[property] ?? []).includes(id)),
      );
  } else if (label === "locators") {
    classification = "locator-change";
    breaking = properties.some((property) =>
      ["concept", "fields", "scope", "status", "routeFiles"].includes(property),
    );
  } else if (label === "benchmarkDecisions") {
    classification = "benchmark-decision-change";
    breaking = properties.some((property) =>
      ["status", "concepts", "capabilities", "locators"].includes(property),
    );
  }

  return { classification, breaking, properties };
}

function diffCollection(before, after, label) {
  const left = keyed(before, label);
  const right = keyed(after, label);
  const changes = [];

  for (const [id, value] of left) {
    if (!right.has(id)) {
      changes.push({
        type: "removed",
        collection: label,
        id,
        classification: label.slice(0, -1) + "-removed",
        breaking: true,
      });
      continue;
    }
    const next = right.get(id);
    if (JSON.stringify(value) !== JSON.stringify(next)) {
      changes.push({
        type: "changed",
        collection: label,
        id,
        ...classifyChanged(label, value, next),
      });
    }
  }

  for (const id of right.keys()) {
    if (!left.has(id)) {
      changes.push({
        type: "added",
        collection: label,
        id,
        classification: label.slice(0, -1) + "-added",
        breaking: false,
      });
    }
  }
  return changes;
}

function diffSingleton(before, after, label) {
  if (JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) return [];
  return [
    {
      type: "changed",
      collection: label,
      id: label,
      classification: label + "-change",
      breaking: label === "contractModel",
      properties: propertyChanges(before, after),
    },
  ];
}

export function diffSemanticModels(before, after) {
  return [
    ...diffSingleton(before.system, after.system, "system"),
    ...diffSingleton(before.language, after.language, "language"),
    ...diffSingleton(before.contractModel, after.contractModel, "contractModel"),
    ...diffCollection(before.semanticOwners, after.semanticOwners, "semanticOwners"),
    ...diffCollection(before.conceptTypes, after.conceptTypes, "conceptTypes"),
    ...diffCollection(before.boundaryTypes, after.boundaryTypes, "boundaryTypes"),
    ...diffCollection(before.integrationModes, after.integrationModes, "integrationModes"),
    ...diffCollection(before.boundedContexts, after.boundedContexts, "boundedContexts"),
    ...diffCollection(before.concepts, after.concepts, "concepts"),
    ...diffCollection(before.relationships, after.relationships, "relationships"),
    ...diffCollection(before.capabilities, after.capabilities, "capabilities"),
    ...diffCollection(before.locators, after.locators, "locators"),
    ...diffCollection(before.benchmarkDecisions, after.benchmarkDecisions, "benchmarkDecisions"),
    ...diffCollection(before.invariants, after.invariants, "invariants"),
    ...diffCollection(before.policies, after.policies, "policies"),
    ...diffCollection(before.truthRegistry, after.truthRegistry, "truthRegistry"),
    ...diffCollection(
      before.evidenceModel?.classes,
      after.evidenceModel?.classes,
      "evidenceClasses",
    ),
    ...diffCollection(
      before.evidenceModel?.validationProfiles,
      after.evidenceModel?.validationProfiles,
      "validationProfiles",
    ),
    ...diffCollection(
      before.implementationMappings,
      after.implementationMappings,
      "implementationMappings",
    ),
  ];
}
