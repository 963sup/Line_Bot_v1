import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const packagesDir = resolve(root, "packages");
const modulesDir = resolve(root, "architecture/modules");
const fence = "`".repeat(3);
const modules = new Map(readdirSync(modulesDir).filter((name) => name.endsWith(".json")).map((name) => {
  const value = JSON.parse(readFileSync(resolve(modulesDir, name), "utf8"));
  return [value.path?.replace(/^packages\//, ""), value];
}));

for (const entry of readdirSync(packagesDir, { withFileTypes: true }).filter((item) => item.isDirectory())) {
  const name = entry.name;
  const manifest = JSON.parse(readFileSync(resolve(packagesDir, name, "package.json"), "utf8"));
  const topology = modules.get(name) ?? {};
  const kind = topology.moduleKind ?? "unknown";
  const deps = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
    .filter((item) => item.startsWith("@line_bot_v1/"))
    .map((item) => item.replace("@line_bot_v1/", ""))
    .sort();
  const exports = Object.keys(manifest.exports ?? {}).sort();
  const edges = deps.length ? deps.map((dep) => `  ${name} --> ${dep}`).join("\n") : `  ${name} --> none`;
  const model = kind === "domain-module"
    ? ["  Aggregate[Aggregate Root] --> Entity[Entities]", "  Aggregate --> ValueObject[Value Objects]", "  Aggregate --> Invariant[Business invariants]"]
    : ["  Application[Application boundary] --> Port[Public port / DTO]", "  Port --> Boundary[External boundary]"];
  const boundary = kind === "integration-adapter"
    ? ["  Application[Owner application] --> Port[Port / DTO]", "  Port --> Adapter[Integration adapter]", "  Adapter --> Provider[External provider]"]
    : kind === "domain-module"
      ? ["  Consumer[Consumer] --> Application[Application]", "  Application --> Domain[Domain]", "  Application --> Ports[Ports]", "  Composition[Composition] --> Adapters[Adapters]", "  Adapters --> Ports"]
      : ["  Consumer[Consumer] --> Application[Application]", "  Application --> Ports[Ports / dependencies]"];
  const invariants = kind === "domain-module"
    ? ["- Domain invariants remain owned here.", "- Authorization, isolation, replay, and version rules fail closed."]
    : ["- This module does not acquire another Owner's business authority.", "- Boundary errors remain explicit and evidence-backed."];
  const lines = [
    `# ${name} Owner Architecture`, "", "<!-- Generated from package.json and architecture/modules/*.json. -->", "",
    "## Context Card", "", "| Field | Value |", "| --- | --- |", `| Owner | ${topology.semanticOwner ?? "unregistered"} |`, `| Module | ${manifest.name} |`, `| Kind | ${kind} |`, "",
    "## Context Boundary", "", `${fence}mermaid`, "flowchart LR", `  Owner[${topology.semanticOwner ?? "unregistered"} Owner] --> Module[${name} module]`, "  Module --> Consumer[Real consumer]", "  Module --> Evidence[Source / tests / schema]", fence, "",
    "## Domain Model", "", `${fence}mermaid`, "flowchart TD", ...model, fence, "",
    "## Boundary and Dependencies", "", `${fence}mermaid`, "flowchart LR", ...boundary, edges, fence, "",
    "## Key Invariants", "", ...invariants, "",
    "## Public Surface", "", ...(exports.length ? exports.map((item) => `- ${item}`) : ["- No public exports declared."]), "",
    "## Evidence", "", "- [Manifest](./package.json)", "- [Source](./src/)", "- [Tests](./test/)", `- [Module topology](../../architecture/modules/${name}.json)`, "",
  ];
  writeFileSync(resolve(packagesDir, name, "ARCHITECTURE.md"), `${lines.join("\n")}\n`);
}
