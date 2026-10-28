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
  const deps = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
    .filter((item) => item.startsWith("@line_bot_v1/"))
    .map((item) => item.replace("@line_bot_v1/", ""))
    .sort();
  const exports = Object.keys(manifest.exports ?? {}).sort();
  const edges = deps.length ? deps.map((dep) => `  ${name} --> ${dep}`).join("\n") : `  ${name} --> none`;
  const kind = topology.moduleKind ?? "unknown";
  const language = [
    `| Owner | ${topology.semanticOwner ?? "unregistered"} |`,
    `| Module kind | ${topology.moduleKind ?? "unknown"} |`,
    "| Package role | implementation module mapped through registry topology |",
  ];
  const invariants = kind === "domain-module"
    ? ["- Domain invariants remain in this Owner.", "- Authorization, isolation, replay, and expected-version rules fail closed."]
    : kind === "integration-adapter"
      ? ["- Provider protocol details remain behind the adapter boundary.", "- External errors are normalized without inventing business truth."]
      : ["- Orchestration does not acquire another Owner's business authority.", "- Public contracts and evidence remain the compatibility boundary."];
  const architecture = kind === "domain-module"
    ? ["## Domain boundary", "", `${fence}mermaid`, "flowchart TD", "  Domain[Domain invariants] --> Application[Application use cases]", "  Application --> Ports[Contracts / ports]", "  Composition[Composition] --> Application", "  Adapters[Adapters] --> Ports", "  Composition --> Adapters", fence]
    : kind === "integration-adapter"
      ? ["## Integration boundary", "", `${fence}mermaid`, "flowchart LR", "  Application[Owner application] --> Port[Port / DTO]", "  Port --> Adapter[Integration adapter]", "  Adapter --> Provider[External provider]", fence]
      : kind === "application-module"
        ? ["## Application boundary", "", `${fence}mermaid`, "flowchart TD", "  Consumer[Consumer] --> Application[Application orchestration]", "  Application --> Ports[Ports / contracts]", "  Application --> Dependencies[Owner dependencies]", fence]
        : ["## Module boundary", "", `${fence}mermaid`, "flowchart LR", "  Consumer[Consumer] --> Module[Module]", "  Module --> Dependencies[Dependencies]", fence];
  const lines = [
    `# ${name} Owner Architecture`, "",
    "<!-- Generated from package.json and architecture/modules/*.json. -->", "",
    "| Field | Value |", "| --- | --- |", `| Package module | ${manifest.name} |`,
    `| semanticOwner | ${topology.semanticOwner ?? "unregistered"} |`, `| moduleKind | ${topology.moduleKind ?? "unknown"} |`, "",
    "## Owner boundary", "", `${fence}mermaid`, "flowchart LR", `  Owner[${topology.semanticOwner ?? "unregistered"} Owner] --> Module[${name} module]`, "  Module --> Consumer[Real consumer]", "  Module --> Evidence[Source / tests / schema]", fence, "",
    "## Ubiquitous language", "", "| Term | Meaning |", "| --- | --- |", ...language, "",
    "## Dependencies", "", `${fence}mermaid`, "flowchart LR", edges, fence, "",
    ...architecture, "",
    "## Invariants", "", ...invariants, "",
    "## State and data flow", "", `${fence}mermaid`, "flowchart LR", "  Input[Input / command] --> UseCase[Use case]", "  UseCase --> Result[Result / state]", "  Result --> Persistence[Persistence / evidence]", fence, "",
    "## Public functions", "", ...(exports.length ? exports.map((item) => `- ${item}`) : ["- No public functions exported."]), "",
    "## Evidence", "", "- [Manifest](./package.json)", "- [Source](./src/)", "- [Tests](./test/)",
    `- [Module topology](../../architecture/modules/${name}.json)`, "",
  ];
  writeFileSync(resolve(packagesDir, name, "ARCHITECTURE.md"), `${lines.join("\n")}\n`);
}
