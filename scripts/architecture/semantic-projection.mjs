const fence = String.fromCharCode(96).repeat(3);

function conceptName(concept) {
  return concept.fpt?.symbol ?? concept.canonicalName ?? concept.id;
}

function conceptMeaning(concept) {
  if (concept.fpt) {
    return `GitHub FPT: ${[concept.fpt.file, concept.fpt.symbol, concept.fpt.field]
      .filter(Boolean)
      .join("#")}`;
  }
  return concept.definition ?? "";
}

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
      concept: conceptName(concept),
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

export function routeFileToUrl(path) {
  if (!path.startsWith("apps/web/src/app/") || !path.endsWith("/page.tsx")) return null;
  const segments = path
    .slice("apps/web/src/app/".length, -"/page.tsx".length)
    .split("/")
    .filter((segment) => segment && !/^\(.+\)$/.test(segment))
    .map((segment) => segment.replace(/^\[(.+)\]$/, "{$1}"));
  return "/" + segments.join("/");
}

function markdownCell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

function ownerContexts(compiled, ownerId) {
  return (compiled.model.boundedContexts ?? []).filter((context) => {
    const owners = context.owners ?? (context.owner ? [context.owner] : []);
    return owners.includes(ownerId);
  });
}

function renderPackageSemanticDoc(compiled, moduleName) {
  if (compiled.errors.length) {
    throw new Error("Semantic architecture is invalid:\n" + compiled.errors.join("\n"));
  }

  const module = compiled.topology.modules?.[moduleName];
  if (!module) throw new Error("Unknown package module: " + moduleName);

  const ownerId = module.semanticOwner;
  const owner = compiled.owners.get(ownerId);
  if (!owner) throw new Error("Unknown semantic owner: " + ownerId);

  const concepts = [...compiled.concepts.values()]
    .filter((concept) => concept.owner === ownerId)
    .sort((a, b) => conceptName(a).localeCompare(conceptName(b)) || a.id.localeCompare(b.id));
  const capabilities = [...compiled.capabilities.values()]
    .filter((capability) => capability.owner === ownerId)
    .sort((a, b) => a.id.localeCompare(b.id));
  const contexts = ownerContexts(compiled, ownerId).sort((a, b) => a.id.localeCompare(b.id));
  const relationships = [...compiled.relationships.values()]
    .filter(
      (relationship) => relationship.provider === ownerId || relationship.consumer === ownerId,
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  const contextSection = contexts.length
    ? markdownTable(
        ["Context", "Status", "Ownership", "Note"],
        contexts.map((context) => [
          markdownCell(context.id),
          markdownCell(context.status),
          markdownCell(
            context.owner
              ? "owner: " + context.owner
              : "owners: " + (context.owners ?? []).join(", "),
          ),
          markdownCell(context.note ?? ""),
        ]),
      )
    : "No Bounded Context is selected or declared for this owner in the canonical semantic model.";

  const languageSection = concepts.length
    ? markdownTable(
        ["Term", "Concept ID", "Kind", "Lifecycle", "Definition"],
        concepts.map((concept) => [
          markdownCell(conceptName(concept)),
          markdownCell(concept.id),
          markdownCell(concept.kind),
          markdownCell(concept.lifecycle),
          markdownCell(conceptMeaning(concept)),
        ]),
      )
    : "No canonical business concept is currently declared for this owner.";

  const capabilitySection = capabilities.length
    ? markdownTable(
        ["Capability", "Runtime", "Implementation", "Intent"],
        capabilities.map((capability) => [
          markdownCell(capability.id),
          markdownCell(capability.runtimeExpectation),
          markdownCell(capability.implementation?.status ?? ""),
          markdownCell(capability.intent),
        ]),
      )
    : "No owner capability is currently declared in the canonical semantic model.";

  const relationshipSection = relationships.length
    ? markdownTable(
        ["Direction", "Counterparty", "Mode", "Authority", "Consistency", "Meaning"],
        relationships.map((relationship) => {
          const outbound = relationship.provider === ownerId;
          return [
            outbound ? "provides" : "consumes",
            markdownCell(outbound ? relationship.consumer : relationship.provider),
            markdownCell(relationship.integrationMode),
            markdownCell(relationship.authority),
            markdownCell(relationship.consistency),
            markdownCell(relationship.meaning),
          ];
        }),
      )
    : "No cross-owner semantic relationship is currently declared for this owner.";

  return [
    "# Package Semantics: " + ownerId,
    "",
    "> Generated projection of `architecture/semantic-model.json` and `architecture/implementation-topology.json`. Do not edit this file as semantic authority. Regenerate with `pnpm semantic package-docs`.",
    "",
    "- Package: `" + module.path + "`",
    "- Module: `" + moduleName + "`",
    "- Module kind: `" + module.moduleKind + "`",
    "- Semantic owner: `" + ownerId + "`",
    "- Owner kind: `" + owner.kind + "`",
    "- Owner lifecycle: `" + owner.lifecycle + "`",
    "- Product domain: `" + compiled.model.system.domain + "`",
    "",
    "## Subdomain",
    "",
    "Subdomain classification is not currently modeled in `architecture/semantic-model.json`; this projection does not invent one.",
    "",
    "## Bounded Context",
    "",
    contextSection,
    "",
    "## Ubiquitous Language",
    "",
    languageSection,
    "",
    "## Capabilities",
    "",
    capabilitySection,
    "",
    "## Context Relationships",
    "",
    relationshipSection,
    "",
    "## Tactical Model Boundary",
    "",
    "Entity, Value Object, Aggregate, Domain Service, Domain Event, Policy, and Specification are not inferred from package names or folders. They must be derived from this owner's canonical language, invariants, consistency requirements, and source evidence before being classified.",
    "",
  ].join("\n");
}

export function packageSemanticDocs(compiled) {
  return new Map(
    Object.entries(compiled.topology.modules ?? {})
      .sort(([, a], [, b]) => a.path.localeCompare(b.path))
      .map(([moduleName, module]) => [
        module.path + "/SEMANTICS.md",
        renderPackageSemanticDoc(compiled, moduleName),
      ]),
  );
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
        .sort((a, b) => conceptName(a).localeCompare(conceptName(b)) || a.id.localeCompare(b.id))
        .map((concept) => [
          conceptName(concept),
          concept.id,
          concept.owner,
          concept.kind,
          concept.lifecycle,
          conceptMeaning(concept).replaceAll("|", "\\|"),
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
      [
        "Capability",
        "Owner",
        "Kind",
        "Implementation",
        "Runtime expectation",
        "Members",
        "Preserves",
        "Validation",
        "Intent",
      ],
      [...compiled.capabilities.values()].map((capability) => [
        capability.id,
        capability.owner,
        capability.kind,
        capability.implementation?.status ?? "",
        capability.runtimeExpectation,
        (capability.members ?? []).join(", "),
        (capability.preserves ?? []).join(", "),
        (capability.validationProfiles ?? []).join(", "),
        capability.intent.replaceAll("|", "\\|"),
      ]),
    ),
  ].join("\n");
}

function locators(compiled) {
  return [
    "# Resource Locators",
    "",
    "> Generated projection of semantic locators. Route files are implementation evidence, not identity authority.",
    "",
    markdownTable(
      [
        "Locator",
        "Concept",
        "Status",
        "Scope",
        "Scope authority",
        "Fields",
        "Route files",
        "Derived URL",
        "FPT",
      ],
      [...compiled.locators.values()].map((locator) => [
        locator.id,
        locator.concept,
        locator.status,
        locator.scope,
        locator.scopeAuthority,
        locator.fields.join(", "),
        (locator.routeFiles ?? []).join(", "),
        (locator.routeFiles ?? []).map(routeFileToUrl).filter(Boolean).join(", "),
        locator.fpt
          ? [locator.fpt.file, locator.fpt.symbol, locator.fpt.field].filter(Boolean).join("#")
          : "",
      ]),
    ),
  ].join("\n");
}

function fptReferences(compiled) {
  const rows = [
    ...[...compiled.concepts.values()]
      .filter((concept) => concept.fpt)
      .map((concept) => [
        "concept",
        concept.id,
        [concept.fpt.file, concept.fpt.symbol, concept.fpt.field].filter(Boolean).join("#"),
      ]),
    ...[...compiled.locators.values()]
      .filter((locator) => locator.fpt)
      .map((locator) => [
        "locator",
        locator.id,
        [locator.fpt.file, locator.fpt.symbol, locator.fpt.field].filter(Boolean).join("#"),
      ]),
  ];
  return [
    "# GitHub FPT Domain Truth",
    "",
    "> GitHub-derived domain semantics resolve directly against the exact vendored FPT JSON. This view contains references only and does not redefine the FPT.",
    "",
    "- Revision: `" + compiled.fpt.manifest.upstream.revision + "`",
    "- Local truth: `" + compiled.fpt.manifest.domainTruth + "`",
    "",
    markdownTable(["Local overlay", "ID", "FPT reference"], rows),
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
    "> Generated read model. GitHub-derived domain semantics remain authoritative in the vendored FPT JSON; this projection adds only Line_Bot_v1 ownership, invariants, implementation and evidence.",
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
    locators(compiled),
    "",
    fptReferences(compiled),
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
  if (view === "locators") return locators(compiled);
  if (view === "fpt-references") return fptReferences(compiled);
  if (view === "evidence") return evidence(compiled);
  if (view === "docs") return docs(compiled);
  throw new Error(
    "Unknown semantic view. Expected ownership, context-map, implementation-map, truth-registry, glossary, contracts, invariants, capabilities, locators, fpt-references, evidence, or docs.",
  );
}
