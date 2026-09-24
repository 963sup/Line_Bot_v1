const fence = String.fromCharCode(96).repeat(3);

function contextMap(compiled) {
  const lines = ["flowchart LR"];
  for (const relationship of compiled.relationships.values()) {
    lines.push(
      "  " +
        relationship.provider.replaceAll("-", "_") +
        '["' +
        relationship.provider +
        '"] -->|"' +
        relationship.integrationMode +
        '"| ' +
        relationship.consumer.replaceAll("-", "_") +
        '["' +
        relationship.consumer +
        '"]',
    );
  }
  return lines.join("\n");
}

function implementationMap(compiled) {
  const lines = ["flowchart LR"];
  for (const mapping of compiled.model.implementationMappings ?? []) {
    const owner = mapping.semanticOwner.replaceAll("-", "_");
    lines.push("  " + owner + '["' + mapping.semanticOwner + '"]');
    if (mapping.module) {
      const moduleId = ("module_" + mapping.module).replaceAll(/[^a-zA-Z0-9_]/g, "_");
      lines.push("  " + owner + " --> " + moduleId + '["' + mapping.module + '"]');
    }
    for (const data of compiled.dataByOwner.get(mapping.semanticOwner) ?? []) {
      const dataId = ("data_" + data.path).replaceAll(/[^a-zA-Z0-9_]/g, "_");
      lines.push("  " + owner + " -->|" + data.relation + "| " + dataId + '["' + data.path + '"]');
    }
  }
  return lines.join("\n");
}

function ownership(compiled) {
  return [...compiled.concepts.values()]
    .map((concept) => ({
      concept: concept.canonicalName,
      id: concept.id,
      owner: concept.owner,
      kind: concept.kind,
      authorityMode: concept.authorityMode,
      lifecycle: concept.lifecycle,
    }))
    .sort((a, b) => a.owner.localeCompare(b.owner) || a.id.localeCompare(b.id));
}

function markdownTable(headers, rows) {
  const header = "| " + headers.join(" | ") + " |";
  const separator = "| " + headers.map(() => "---").join(" | ") + " |";
  return [header, separator, ...rows.map((row) => "| " + row.join(" | ") + " |")].join("\n");
}

function glossary(compiled) {
  return [
    "# Semantic Glossary",
    "",
    "> Generated projection of architecture/semantic-model.json; do not edit as authority.",
    "",
    markdownTable(
      ["Concept", "ID", "Owner", "Kind", "Lifecycle", "Definition"],
      [...compiled.concepts.values()]
        .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName) || a.id.localeCompare(b.id))
        .map((concept) => [
          concept.canonicalName,
          concept.id,
          concept.owner,
          concept.kind,
          concept.lifecycle,
          concept.definition.replaceAll("|", "\\|"),
        ]),
    ),
  ].join("\n");
}

function contracts(compiled) {
  return [
    "# Integration Contracts",
    "",
    "> Generated projection of semantic relationships; provider authority is retained.",
    "",
    markdownTable(
      ["Provider", "Consumer", "Mode", "Authority", "Consistency", "Meaning"],
      [...compiled.relationships.values()].map((relationship) => [
        relationship.provider,
        relationship.consumer,
        relationship.integrationMode,
        relationship.authority,
        relationship.consistency,
        relationship.meaning.replaceAll("|", "\\|"),
      ]),
    ),
  ].join("\n");
}

function invariants(compiled) {
  return [
    "# Semantic Invariants",
    "",
    "> Generated projection. Enforcement and evidence remain scoped to canonical owners.",
    "",
    markdownTable(
      ["ID", "Scope", "Severity", "Tags", "Statement"],
      [...compiled.invariants.values()].map((invariant) => [
        invariant.id,
        invariant.scope,
        invariant.severity,
        (invariant.tags ?? []).join(", "),
        invariant.statement.replaceAll("|", "\\|"),
      ]),
    ),
  ].join("\n");
}

function capabilities(compiled) {
  return [
    "# Capability Catalog",
    "",
    "> Generated projection of semantic capabilities.",
    "",
    markdownTable(
      ["Capability", "Owner", "Runtime expectation", "Preserves", "Validation", "Intent"],
      [...compiled.capabilities.values()].map((capability) => [
        capability.id,
        capability.owner,
        capability.runtimeExpectation,
        (capability.preserves ?? []).join(", "),
        (capability.validationProfiles ?? []).join(", "),
        capability.intent.replaceAll("|", "\\|"),
      ]),
    ),
  ].join("\n");
}

function evidence(compiled) {
  return [
    "# Evidence Model",
    "",
    "> Generated projection. Evidence never proves a stronger scope than what was executed.",
    "",
    "## Validation profiles",
    "",
    markdownTable(
      ["Profile", "Command", "Class", "Proves", "Does not prove"],
      [...compiled.validationProfiles.values()].map((profile) => [
        profile.id,
        profile.command,
        profile.evidenceClass,
        profile.proves.join("; ").replaceAll("|", "\\|"),
        (profile.doesNotProve ?? []).join("; ").replaceAll("|", "\\|"),
      ]),
    ),
    "",
    "## Feedback channels",
    "",
    markdownTable(
      ["Channel", "Evidence class", "May revise"],
      (compiled.model.evidenceModel?.feedback?.channels ?? []).map((channel) => [
        channel.id,
        channel.evidenceClass,
        channel.mayRevise.join("; ").replaceAll("|", "\\|"),
      ]),
    ),
  ].join("\n");
}

function docs(compiled) {
  return [
    "# Executable Semantic Architecture",
    "",
    "> Generated read model. Canonical authority remains the semantic model, implementation topology, data topology, declarative schemas, and pinned external benchmark.",
    "",
    "## Ownership",
    "",
    fence + "json",
    JSON.stringify(ownership(compiled), null, 2),
    fence,
    "",
    glossary(compiled),
    "",
    contracts(compiled),
    "",
    invariants(compiled),
    "",
    capabilities(compiled),
    "",
    evidence(compiled),
    "",
    "## Context map",
    "",
    fence + "mermaid",
    contextMap(compiled),
    fence,
    "",
    "## Implementation map",
    "",
    fence + "mermaid",
    implementationMap(compiled),
    fence,
  ].join("\n");
}

export function renderSemanticView(compiled, view = "ownership") {
  if (compiled.errors.length) {
    throw new Error("Semantic architecture is invalid:\n" + compiled.errors.join("\n"));
  }
  if (view === "context-map") return contextMap(compiled);
  if (view === "implementation-map") return implementationMap(compiled);
  if (view === "ownership") return JSON.stringify(ownership(compiled), null, 2);
  if (view === "truth-registry") return JSON.stringify(compiled.model.truthRegistry, null, 2);
  if (view === "glossary") return glossary(compiled);
  if (view === "contracts") return contracts(compiled);
  if (view === "invariants") return invariants(compiled);
  if (view === "capabilities") return capabilities(compiled);
  if (view === "evidence") return evidence(compiled);
  if (view === "docs") return docs(compiled);
  throw new Error(
    "Unknown semantic view. Expected ownership, context-map, implementation-map, truth-registry, glossary, contracts, invariants, capabilities, evidence, or docs.",
  );
}
