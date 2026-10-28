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
  const lines = [
    `# ${name} Owner Architecture`, "",
    "<!-- Generated from package.json and architecture/modules/*.json. -->", "",
    "| Field | Value |", "| --- | --- |", `| Package module | ${manifest.name} |`,
    `| semanticOwner | ${topology.semanticOwner ?? "unregistered"} |`, `| moduleKind | ${topology.moduleKind ?? "unknown"} |`, "",
    "## Boundary and dependencies", "", `${fence}mermaid`, "flowchart LR", edges, fence, "",
    "## Hexagonal placement", "", `${fence}mermaid`, "flowchart TD",
    "Domain[Domain] --> Application[Application]", "Application --> Contracts[Contracts / Ports]",
    "Composition[Composition] --> Application", "Adapters[Adapters] --> Contracts", "Composition --> Adapters", fence, "",
    "## Public surface", "", ...(exports.length ? exports.map((item) => `- ${item}`) : ["- No public exports declared."]), "",
    "## Evidence", "", "- [Manifest](./package.json)", "- [Source](./src/)", "- [Tests](./test/)",
    `- [Module topology](../../architecture/modules/${name}.json)`, "",
  ];
  writeFileSync(resolve(packagesDir, name, "ARCHITECTURE.md"), `${lines.join("\n")}\n`);
}
